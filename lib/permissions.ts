/**
 * Kullanıcı bazlı modül izin sistemi.
 * Her modül bir route key'e karşılık gelir.
 * ADMIN kullanıcılar her zaman tam erişime sahiptir.
 */

import { prisma } from "@/lib/db"
import { auth } from "@/auth"

// Modül tanımları + route haritası Edge-safe dosyada (middleware de kullanıyor).
// Buradan re-export → mevcut importerlar kırılmaz.
export {
  ALL_MODULES,
  MODULE_KEYS,
  getModuleKeyForRoute,
  type ModuleDefinition,
} from "@/lib/route-permissions"
import { ALL_MODULES } from "@/lib/route-permissions"

// ─── Permission tipi ──────────────────────────────────────────

export interface UserPermissionMap {
  [moduleKey: string]: { canView: boolean; canEdit: boolean }
}

// ─── DB'den izinleri çek ──────────────────────────────────────

export async function getUserPermissions(userId: string): Promise<UserPermissionMap> {
  const rows = await prisma.userPermission.findMany({
    where: { userId },
    select: { module: true, canView: true, canEdit: true },
  })

  const map: UserPermissionMap = {}
  for (const r of rows) {
    map[r.module] = { canView: r.canView, canEdit: r.canEdit }
  }

  // Eksik modüller için default false ile doldur
  // (yeni modül eklendiğinde mevcut kullanıcılar için satır olmayabilir)
  for (const mod of ALL_MODULES) {
    if (!(mod.key in map)) {
      map[mod.key] = { canView: false, canEdit: false }
    }
  }

  return map
}

// ─── Kontrol fonksiyonları ────────────────────────────────────

export function canView(permissions: UserPermissionMap, moduleKey: string): boolean {
  const p = permissions[moduleKey]
  return p?.canView ?? false
}

export function canEdit(permissions: UserPermissionMap, moduleKey: string): boolean {
  const p = permissions[moduleKey]
  return p?.canEdit ?? false
}

// ─── Server-side auth + permission check ──────────────────────

export interface AuthUser {
  id: string
  role: string
  permissions: UserPermissionMap
  /**
   * Kullanıcının erişebileceği markalar.
   * null → kısıtlama yok (ADMIN veya hiç UserAllowedBrand kaydı olmayan kullanıcı).
   * [] / [n,...] → sadece bu marka(lar) görülebilir (siparişler vs.).
   */
  allowedBrandIds: number[] | null
}

/**
 * Server component / server action'lardan çağırılır.
 * Giriş yapmamışsa null döner.
 * ADMIN her zaman tam erişime sahiptir (permissions check atlanır).
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isActive: true },
  })

  if (!user || !user.isActive) return null

  // ADMIN = full access, permission map doldurmaya gerek yok, marka kısıtı yok
  if (user.role === "ADMIN") {
    const fullPerms: UserPermissionMap = {}
    for (const mod of ALL_MODULES) {
      fullPerms[mod.key] = { canView: true, canEdit: true }
    }
    return { id: user.id, role: user.role, permissions: fullPerms, allowedBrandIds: null }
  }

  const [permissions, allowedBrands] = await Promise.all([
    getUserPermissions(user.id),
    prisma.userAllowedBrand.findMany({
      where: { userId: user.id },
      select: { brandId: true },
    }),
  ])
  // Hiç kayıt yoksa → kısıt yok (tüm markalara erişim).
  const allowedBrandIds = allowedBrands.length > 0 ? allowedBrands.map((b) => b.brandId) : null
  return { id: user.id, role: user.role, permissions, allowedBrandIds }
}

/**
 * Server action'larda kullanım:
 * const user = await requirePermission("urunler", "edit")
 * — izin yoksa throw eder.
 */
export async function requirePermission(
  moduleKey: string,
  level: "view" | "edit"
): Promise<AuthUser> {
  const user = await getAuthUser()
  if (!user) throw new Error("Giriş yapılmamış")

  const perms = user.permissions[moduleKey]
  if (level === "view" && !perms?.canView) {
    throw new Error("Bu modülü görüntüleme yetkiniz yok")
  }
  if (level === "edit" && !perms?.canEdit) {
    throw new Error("Bu modülde düzenleme yetkiniz yok")
  }

  return user
}

/**
 * Sadece ADMIN kullanıcılar için.
 * ADMIN değilse throw eder.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await getAuthUser()
  if (!user) throw new Error("Giriş yapılmamış")
  if (user.role !== "ADMIN") throw new Error("Bu işlem için admin yetkisi gerekli")
  return user
}
