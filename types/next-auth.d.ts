import type { DefaultSession } from "next-auth"

type AppUserRole = "ADMIN" | "MANAGER" | "STAFF" | "SALES"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role?: AppUserRole
      pharmacyId?: number
      username?: string
    } & DefaultSession["user"]
  }

  interface User {
    role?: AppUserRole
    pharmacyId?: number
    username?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppUserRole
    pharmacyId?: number
    username?: string
  }
}
