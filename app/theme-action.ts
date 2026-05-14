"use server"

import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { getAuthUser } from "@/lib/permissions"

const THEME_COOKIE = "ochi-theme"

/**
 * Kullanıcı tema tercihini kaydet (DB + cookie).
 * Cookie hem hızlı SSR (no DB hit) hem fallback için.
 */
export async function setUserTheme(theme: "light" | "dark" | "system"): Promise<{ ok: boolean }> {
  const user = await getAuthUser()

  // Cookie her zaman set (logged-in olmayanlar için fallback)
  const cookieStore = await cookies()
  cookieStore.set(THEME_COOKIE, theme, {
    maxAge: 60 * 60 * 24 * 365, // 1 yıl
    httpOnly: false, // client-side okuma için
    sameSite: "lax",
    path: "/",
  })

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { themePreference: theme },
    })
  }
  return { ok: true }
}

/**
 * Server-side: login olan kullanıcının tema tercihini oku.
 * Login değilse cookie'ye veya "system"a düşer.
 */
export async function getUserTheme(): Promise<"light" | "dark" | "system"> {
  const user = await getAuthUser()
  if (user) {
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { themePreference: true },
    })
    if (u?.themePreference === "light" || u?.themePreference === "dark" || u?.themePreference === "system") {
      return u.themePreference
    }
  }
  const cookieStore = await cookies()
  const c = cookieStore.get(THEME_COOKIE)?.value
  if (c === "light" || c === "dark" || c === "system") return c
  return "system"
}
