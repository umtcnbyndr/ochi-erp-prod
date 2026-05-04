"use server"

import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { ALL_MODULES } from "@/lib/permissions"
import { BCRYPT_COST } from "@/lib/auth/password-policy"

// ─── Types ────────────────────────────────────────────────────

export interface CreateUserInput {
  username: string
  name: string
  password: string
  role: "ADMIN" | "MANAGER" | "STAFF"
  permissions: Record<string, { canView: boolean; canEdit: boolean }>
}

export interface UpdateUserInput {
  name?: string
  password?: string  // boşsa değiştirme
  role?: "ADMIN" | "MANAGER" | "STAFF"
  isActive?: boolean
  permissions?: Record<string, { canView: boolean; canEdit: boolean }>
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
}

// ─── CRUD ─────────────────────────────────────────────────────

export async function listUsers(): Promise<UserWithPermissions[]> {
  return prisma.user.findMany({
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
    },
    orderBy: { createdAt: "asc" },
  })
}

export async function getUserById(id: string): Promise<UserWithPermissions | null> {
  return prisma.user.findUnique({
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
    },
  })
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
      role: input.role as "ADMIN" | "MANAGER" | "STAFF",
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
