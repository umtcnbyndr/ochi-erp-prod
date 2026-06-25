import type { NextAuthConfig } from "next-auth"
import { getModuleKeyForRoute } from "@/lib/route-permissions"

/**
 * Middleware-safe auth config (no Prisma here — edge runtime).
 * Providers are attached in `auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnAuth = nextUrl.pathname.startsWith("/login") ||
                       nextUrl.pathname.startsWith("/register")

      if (isOnAuth) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl))
        return true
      }

      // protected routes — önce giriş
      if (!isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl)
        loginUrl.searchParams.set("from", nextUrl.pathname)
        return Response.redirect(loginUrl)
      }

      // MERKEZİ YETKİ GATE: route'un modülü varsa, kullanıcının o modüle izni
      // olmalı. Token'a gömülü perms ile Edge'de DB'siz kontrol. İzin yoksa
      // /yetkisiz'e yönlendir (sayfa hiç render olmaz → URL açığı kapanır).
      const moduleKey = getModuleKeyForRoute(nextUrl.pathname)
      if (moduleKey) {
        const u = auth!.user as { role?: string; perms?: string[] | "ALL" }
        const allowed =
          u.role === "ADMIN" ||
          u.perms === "ALL" ||
          (Array.isArray(u.perms) && u.perms.includes(moduleKey))
        if (!allowed) {
          return Response.redirect(new URL("/yetkisiz", nextUrl))
        }
      }
      return true
    },
    session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
      }
      if (token.role && session.user) {
        ;(session.user as { role?: string }).role = token.role as string
      }
      if (token.pharmacyId !== undefined && session.user) {
        ;(session.user as { pharmacyId?: number }).pharmacyId = token.pharmacyId as number
      }
      if (token.username && session.user) {
        ;(session.user as { username?: string }).username = token.username as string
      }
      if (token.perms !== undefined && session.user) {
        ;(session.user as { perms?: string[] | "ALL" }).perms =
          token.perms as string[] | "ALL"
      }
      return session
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.pharmacyId = (user as { pharmacyId?: number }).pharmacyId
        token.username = (user as { username?: string }).username
        token.perms = (user as { perms?: string[] | "ALL" }).perms
      }
      return token
    },
  },
  providers: [], // filled in auth.ts
} satisfies NextAuthConfig
