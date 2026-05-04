import type { NextAuthConfig } from "next-auth"

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

      // protected routes
      if (!isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl)
        loginUrl.searchParams.set("from", nextUrl.pathname)
        return Response.redirect(loginUrl)
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
      return session
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.pharmacyId = (user as { pharmacyId?: number }).pharmacyId
        token.username = (user as { username?: string }).username
      }
      return token
    },
  },
  providers: [], // filled in auth.ts
} satisfies NextAuthConfig
