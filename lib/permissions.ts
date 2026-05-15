/**
 * Kullanıcı bazlı modül izin sistemi.
 * Her modül bir route key'e karşılık gelir.
 * ADMIN kullanıcılar her zaman tam erişime sahiptir.
 */

import { prisma } from "@/lib/db"
import { auth } from "@/auth"

// ─── Modül tanımları ───────────────────────────────────────────

export interface ModuleDefinition {
  key: string
  label: string
  /** Sidebar'daki route — permission kontrolünde kullanılır */
  routes: string[]
}

export const ALL_MODULES: ModuleDefinition[] = [
  { key: "panel",            label: "Panel",              routes: ["/panel"] },
  { key: "urunler",          label: "Ürünler",            routes: ["/urunler"] },
  { key: "urun-giris",       label: "Ürün Giriş",        routes: ["/urun-giris"] },
  { key: "urun-cikis",       label: "Ürün Çıkış",        routes: ["/urun-cikis"] },
  { key: "takas",            label: "Takas",              routes: ["/takas"] },
  { key: "stok-hareketleri", label: "Stok Hareketleri",   routes: ["/stok-hareketleri"] },
  { key: "set-urun",         label: "Set Ürünler",        routes: ["/set-urun"] },
  { key: "siparisler",       label: "Siparişler",         routes: ["/siparisler"] },
  { key: "kampanyalar",      label: "Kampanyalar",        routes: ["/kampanyalar"] },
  { key: "eczane-yukleme",   label: "Eczane Veri Yükleme",routes: ["/eczane-yukleme"] },
  { key: "barkod-eslestirme",label: "Barkod Eşleştirme",  routes: ["/barkod-eslestirme"] },
  { key: "dopigo-yukle",     label: "Dopigo Yükleme",     routes: ["/dopigo-yukle"] },
  { key: "dopigo-aktar",     label: "Dopigo Aktarım",     routes: ["/dopigo-aktar"] },
  { key: "fiyat-onerileri",  label: "Fiyat Önerileri",    routes: ["/fiyat-onerileri"] },
  { key: "fiyat-kontrol",    label: "Fiyat Kontrol",      routes: ["/fiyat-kontrol"] },
  { key: "trendyol-favoriler", label: "Trendyol Favorilenme", routes: ["/trendyol-favoriler"] },
  { key: "komisyon-tarifeleri", label: "Komisyon Tarifeleri", routes: ["/komisyon-tarifeleri"] },
  { key: "kupon-onerileri",  label: "Kupon Önerileri",   routes: ["/kupon-onerileri"] },
  { key: "dopigo-siparisler",label: "Dopigo Siparişler",  routes: ["/dopigo-siparisler"] },
  { key: "markalar",         label: "Markalar",           routes: ["/markalar"] },
  { key: "kategoriler",      label: "Kategoriler",        routes: ["/kategoriler"] },
  { key: "marketplaces",     label: "Pazar Yerleri",      routes: ["/marketplaces"] },
  { key: "cariler",          label: "Cariler",            routes: ["/cariler"] },
  { key: "finans-faturalar", label: "Alış Faturaları",    routes: ["/finans/faturalar"] },
  { key: "finans-gelir-gider", label: "Gelir / Gider",    routes: ["/finans/gelir-gider"] },
  { key: "raporlar",         label: "Raporlar",           routes: ["/raporlar"] },
  { key: "ayarlar",          label: "Ayarlar",            routes: ["/ayarlar"] },
]

export const MODULE_KEYS = ALL_MODULES.map((m) => m.key)

// ─── Route → Module mapping ───────────────────────────────────

/** pathname'den module key'i bul. Eşleşmezse null döner. */
export function getModuleKeyForRoute(pathname: string): string | null {
  for (const mod of ALL_MODULES) {
    for (const route of mod.routes) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        return mod.key
      }
    }
  }
  return null
}

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
