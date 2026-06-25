import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { authConfig } from "./auth.config"
import {
  isLoginBlocked,
  recordFailedLogin,
  resetLoginAttempts,
} from "@/lib/auth/login-rate-limit"
import { writeAuditLog } from "@/lib/services/audit-log"

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 saat
    updateAge: 60 * 60, // 1 saatte bir token yenile
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Kullanıcı Adı", type: "text" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { username, password } = parsed.data

        // Rate limit: 15 dk içinde 5 başarısız deneme → bloke
        const block = isLoginBlocked(username)
        if (block.blocked) {
          // Auth.js authorize null döndürünce hata fırlatır.
          // Süreyi log'a yazalım, kullanıcıya generic mesaj gitsin.
          console.warn(
            `[auth] Login blocked for "${username}", retry in ${block.retryAfterSeconds}s`,
          )
          return null
        }

        const user = await prisma.user.findUnique({ where: { username } })
        if (!user || !user.passwordHash) {
          recordFailedLogin(username)
          await writeAuditLog({
            action: "LOGIN_FAIL",
            entityType: "User",
            after: { username, reason: "USER_NOT_FOUND" },
          })
          return null
        }
        if (!user.isActive) {
          recordFailedLogin(username)
          await writeAuditLog({
            userId: user.id,
            action: "LOGIN_FAIL",
            entityType: "User",
            entityId: user.id,
            after: { username, reason: "INACTIVE" },
          })
          return null
        }

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) {
          recordFailedLogin(username)
          await writeAuditLog({
            userId: user.id,
            action: "LOGIN_FAIL",
            entityType: "User",
            entityId: user.id,
            after: { username, reason: "BAD_PASSWORD" },
          })
          return null
        }

        // Başarılı login → counter sıfırla
        resetLoginAttempts(username)

        // Görebileceği modülleri token'a göm (middleware Edge'de DB'ye bakamaz).
        // ADMIN → "ALL". Diğerleri → canView=true olan modül key'leri.
        let perms: string[] | "ALL"
        if (user.role === "ADMIN") {
          perms = "ALL"
        } else {
          const permRows = await prisma.userPermission.findMany({
            where: { userId: user.id, canView: true },
            select: { module: true },
          })
          perms = permRows.map((r) => r.module)
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.username,
          role: user.role,
          pharmacyId: user.pharmacyId,
          perms,
        }
      },
    }),
  ],
})
