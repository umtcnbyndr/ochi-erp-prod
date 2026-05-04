"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/permissions"
import {
  createUser,
  updateUser,
  deleteUser,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/lib/services/user"
import { validatePassword } from "@/lib/auth/password-policy"
import { writeAuditLog } from "@/lib/services/audit-log"

type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

export async function createUserAction(
  input: CreateUserInput
): Promise<ActionResult<{ id: string; username: string }>> {
  try {
    const actor = await requirePermission("ayarlar", "edit")

    if (!input.username || input.username.length < 2) {
      return { success: false, error: "Kullanıcı adı en az 2 karakter olmalı" }
    }
    const pwCheck = validatePassword(input.password)
    if (!pwCheck.ok) {
      return { success: false, error: pwCheck.error! }
    }
    if (!input.name) {
      return { success: false, error: "İsim zorunlu" }
    }

    const result = await createUser(input)

    await writeAuditLog({
      userId: actor.id,
      action: "USER_CREATE",
      entityType: "User",
      entityId: result.id,
      after: {
        username: result.username,
        name: input.name,
        role: input.role,
        permissions: input.permissions,
      },
    })

    revalidatePath("/ayarlar/kullanicilar")
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Kullanıcı oluşturulamadı" }
  }
}

export async function updateUserAction(
  id: string,
  input: UpdateUserInput
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("ayarlar", "edit")
    await updateUser(id, input)

    // Sifreyi after'a koymuyoruz (zaten hashleniyor)
    const { password: _password, ...safeInput } = input
    void _password

    await writeAuditLog({
      userId: actor.id,
      action: "USER_UPDATE",
      entityType: "User",
      entityId: id,
      after: {
        ...safeInput,
        passwordChanged: !!input.password,
      },
    })

    revalidatePath("/ayarlar/kullanicilar")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteUserAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("ayarlar", "edit")
    await deleteUser(id)

    await writeAuditLog({
      userId: actor.id,
      action: "USER_DELETE",
      entityType: "User",
      entityId: id,
    })

    revalidatePath("/ayarlar/kullanicilar")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}
