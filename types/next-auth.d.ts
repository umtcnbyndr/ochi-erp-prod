import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role?: "ADMIN" | "MANAGER" | "STAFF"
      pharmacyId?: number
    } & DefaultSession["user"]
  }

  interface User {
    role?: "ADMIN" | "MANAGER" | "STAFF"
    pharmacyId?: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ADMIN" | "MANAGER" | "STAFF"
    pharmacyId?: number
  }
}
