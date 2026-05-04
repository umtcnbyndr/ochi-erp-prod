"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getAuthUser } from "@/lib/permissions"

export interface NoteActionResult {
  success: boolean
  error?: string
}

export async function createNoteAction(text: string): Promise<NoteActionResult> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: "Giriş yapılmamış" }

    const trimmed = text.trim()
    if (!trimmed) return { success: false, error: "Not boş olamaz" }
    if (trimmed.length > 500) return { success: false, error: "Not çok uzun (max 500 karakter)" }

    await prisma.panelNote.create({
      data: { userId: user.id, text: trimmed },
    })
    revalidatePath("/panel")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Eklenemedi" }
  }
}

export async function toggleNoteDoneAction(id: number): Promise<NoteActionResult> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: "Giriş yapılmamış" }

    const note = await prisma.panelNote.findUnique({ where: { id } })
    if (!note || note.userId !== user.id) {
      return { success: false, error: "Not bulunamadı" }
    }

    await prisma.panelNote.update({
      where: { id },
      data: {
        done: !note.done,
        doneAt: !note.done ? new Date() : null,
      },
    })
    revalidatePath("/panel")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "İşaretlenemedi" }
  }
}

export async function togglePinNoteAction(id: number): Promise<NoteActionResult> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: "Giriş yapılmamış" }

    const note = await prisma.panelNote.findUnique({ where: { id } })
    if (!note || note.userId !== user.id) {
      return { success: false, error: "Not bulunamadı" }
    }

    await prisma.panelNote.update({
      where: { id },
      data: { pinned: !note.pinned },
    })
    revalidatePath("/panel")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sabitlenemedi" }
  }
}

export async function deleteNoteAction(id: number): Promise<NoteActionResult> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: "Giriş yapılmamış" }

    const note = await prisma.panelNote.findUnique({ where: { id } })
    if (!note || note.userId !== user.id) {
      return { success: false, error: "Not bulunamadı" }
    }

    await prisma.panelNote.delete({ where: { id } })
    revalidatePath("/panel")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}
