import type { DefaultSession } from "next-auth"

type AppUserRole = "ADMIN" | "MANAGER" | "STAFF" | "SALES"

// Görebileceği modül key'leri; ADMIN için "ALL".
type AppPerms = string[] | "ALL"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role?: AppUserRole
      pharmacyId?: number
      username?: string
      perms?: AppPerms
    } & DefaultSession["user"]
  }

  interface User {
    role?: AppUserRole
    pharmacyId?: number
    username?: string
    perms?: AppPerms
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppUserRole
    pharmacyId?: number
    username?: string
    perms?: AppPerms
  }
}
