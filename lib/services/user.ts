"use server"

import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { ALL_MODULES } from "@/lib/permissions"
import { BCRYPT_COST } from "@/lib/auth/password-policy"

// ─── Types ────────────────────────────────────────────────────

export type UserRoleT = "ADMIN" | "MANAGER" | "STAFF" | "SALES"

export interface CreateUserInput {
  username: string
  name: string
  password: string
  role: UserRoleT
  permissions: Record<string, { canView: boolean; canEdit: boolean }>
  /** Boş array veya undefined → kısıtlama yok (tüm markalara erişim) */
  allowedBrandIds?: number[]
}

export interface UpdateUserInput {
  name?: string
  password?: string  // boşsa değiştirme
  role?: UserRoleT
  isActive?: boolean
  permissions?: Record<string, { canView: boolean; canEdit: boolean }>
  /** undefined → değiştirme. [] → tümünü kaldır (tüm markaya erişim). [1,2] → sadece bunlar. */
  allowedBrandIds?: number[]
}

export interface UserWithPermissions {
  id: string
  username: string
  name: string | null
  email: string
  role: string
  isActive: boolean
  createdAt: Date
  permissions: { module: string; canView: boolean; canEdit: boolean }[]
  allowedBrandIds: number[]
}

// ─── CRUD ─────────────────────────────────────────────────────

export async function listUsers(): Promise<UserWithPermissions[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      permissions: {
        select: { module: true, canView: true, canEdit: true },
        orderBy: { module: "asc" },
      },
      allowedBrands: { select: { brandId: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  return users.map((u) => ({
    ...u,
    allowedBrandIds: u.allowedBrands.map((a) => a.brandId),
  }))
}

export async function getUserById(id: string): Promise<UserWithPermissions | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      permissions: {
        select: { module: true, canView: true, canEdit: true },
        orderBy: { module: "asc" },
      },
      allowedBrands: { select: { brandId: true } },
    },
  })
  if (!u) return null
  return { ...u, allowedBrandIds: u.allowedBrands.map((a) => a.brandId) }
}

export async function createUser(input: CreateUserInput) {
  // Username unique kontrolü
  const existing = await prisma.user.findUnique({
    where: { username: input.username },
  })
  if (existing) throw new Error("Bu kullanıcı adı zaten kullanılıyor")

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST)

  // email = username@ochi-erp.local (internal, login username ile)
  const email = `${input.username}@ochi-erp.local`

  const emailExists = await prisma.user.findUnique({ where: { email } })
  if (emailExists) throw new Error("Bu kullanıcı adı zaten kullanılıyor")

  const user = await prisma.user.create({
    data: {
      username: input.username,
      name: input.name,
      email,
      passwordHash,
      role: input.role,
      permissions: {
        create: ALL_MODULES.map((mod) => {
          const perm = input.permissions[mod.key]
          return {
            module: mod.key,
            canView: perm?.canView ?? false,
            canEdit: perm?.canEdit ?? false,
          }
        }),
      },
      allowedBrands:
        input.allowedBrandIds && input.allowedBrandIds.length > 0
          ? { create: input.allowedBrandIds.map((brandId) => ({ brandId })) }
          : undefined,
    },
    select: { id: true, username: true },
  })

  return user
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new Error("Kullanıcı bulunamadı")

  // Admin kendini deaktif edemez
  if (input.isActive === false && existing.role === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    })
    if (adminCount <= 1) throw new Error("Son admin kullanıcı deaktif edilemez")
  }

  const updateData: Record<string, unknown> = {}

  if (input.name !== undefined) updateData.name = input.name
  if (input.role !== undefined) updateData.role = input.role
  if (input.isActive !== undefined) updateData.isActive = input.isActive
  if (input.password) {
    updateData.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST)
  }

  await prisma.user.update({
    where: { id },
    data: updateData,
  })

  // İzinleri güncelle
  if (input.permissions) {
    // Upsert her modül
    for (const mod of ALL_MODULES) {
      const perm = input.permissions[mod.key]
      await prisma.userPermission.upsert({
        where: { userId_module: { userId: id, module: mod.key } },
        create: {
          userId: id,
          module: mod.key,
          canView: perm?.canView ?? false,
          canEdit: perm?.canEdit ?? false,
        },
        update: {
          canView: perm?.canView ?? false,
          canEdit: perm?.canEdit ?? false,
        },
      })
    }
  }

  // Allowed brand'leri güncelle (undefined → değiştirme)
  if (input.allowedBrandIds !== undefined) {
    await prisma.userAllowedBrand.deleteMany({ where: { userId: id } })
    if (input.allowedBrandIds.length > 0) {
      await prisma.userAllowedBrand.createMany({
        data: input.allowedBrandIds.map((brandId) => ({ userId: id, brandId })),
        skipDuplicates: true,
      })
    }
  }

  return { id }
}

export async function deleteUser(id: string) {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new Error("Kullanıcı bulunamadı")

  if (existing.role === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    })
    if (adminCount <= 1) throw new Error("Son admin kullanıcı silinemez")
  }

  await prisma.user.delete({ where: { id } })
  return { id }
}
