"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import {
  testTrendyolConnection,
  type TrendyolEnvironment,
} from "@/lib/services/trendyol/client"
import { requireAdmin } from "@/lib/permissions"
import { encrypt, decrypt } from "@/lib/auth/secret-crypto"
import { writeAuditLog } from "@/lib/services/audit-log"

const SECRET_PLACEHOLDER = "***"

const trendyolSchema = z.object({
  supplierId: z.string().trim().min(1, "Satıcı ID zorunlu").max(50),
  apiKey: z.string().trim().min(1, "API Key zorunlu").max(200),
  apiSecret: z.string().trim().min(1, "API Secret zorunlu").max(500),
  environment: z.enum(["prod", "stage"]).default("prod"),
  isActive: z.boolean().default(true),
})

export type TrendyolFormResult =
  | { success: true; tested: boolean; testMessage?: string }
  | { success: false; error: string }

export async function saveTrendyolConfigAction(input: {
  supplierId: string
  apiKey: string
  apiSecret: string
  environment: TrendyolEnvironment
  isActive: boolean
  alsoTest: boolean
}): Promise<TrendyolFormResult> {
  const adminUser = await requireAdmin()
  const parsed = trendyolSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  }

  // Eğer kullanici secret'i degistirmediyse (placeholder geldi), mevcut secret'i koru.
  // Aksi halde yeni secret'i encrypt edip yaz.
  let secretToStore: string | null = null
  if (parsed.data.apiSecret === SECRET_PLACEHOLDER) {
    const existing = await prisma.trendyolConfig.findUnique({ where: { id: 1 } })
    if (!existing?.apiSecret) {
      return { success: false, error: "API Secret zorunlu (kayitli secret yok)" }
    }
    secretToStore = existing.apiSecret
  } else {
    secretToStore = encrypt(parsed.data.apiSecret)
  }

  // Test icin DAIMA plaintext secret kullan (decrypt edilmis veya yeni girilen)
  const plaintextSecretForTest =
    parsed.data.apiSecret === SECRET_PLACEHOLDER
      ? decrypt(secretToStore)
      : parsed.data.apiSecret

  let testOk: boolean | null = null
  let testMessage: string | undefined

  if (input.alsoTest) {
    const test = await testTrendyolConnection({
      supplierId: parsed.data.supplierId,
      apiKey: parsed.data.apiKey,
      apiSecret: plaintextSecretForTest,
      environment: parsed.data.environment,
    })
    testOk = test.ok
    testMessage = test.message
  }

  const before = await prisma.trendyolConfig.findUnique({ where: { id: 1 } })

  await prisma.trendyolConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      supplierId: parsed.data.supplierId,
      apiKey: parsed.data.apiKey,
      apiSecret: secretToStore,
      environment: parsed.data.environment,
      isActive: parsed.data.isActive,
      lastTestedAt: testOk != null ? new Date() : null,
      lastTestOk: testOk,
      lastTestNote: testMessage ?? null,
    },
    update: {
      supplierId: parsed.data.supplierId,
      apiKey: parsed.data.apiKey,
      apiSecret: secretToStore,
      environment: parsed.data.environment,
      isActive: parsed.data.isActive,
      ...(testOk != null
        ? {
            lastTestedAt: new Date(),
            lastTestOk: testOk,
            lastTestNote: testMessage ?? null,
          }
        : {}),
    },
  })

  // Audit log: secret degeri kaydetmiyoruz (sifresizken bile log'da gorunmesin)
  await writeAuditLog({
    userId: adminUser.id,
    action: "TRENDYOL_CONFIG_UPDATE",
    entityType: "TrendyolConfig",
    entityId: 1,
    before: before
      ? {
          supplierId: before.supplierId,
          apiKey: before.apiKey,
          environment: before.environment,
          isActive: before.isActive,
        }
      : null,
    after: {
      supplierId: parsed.data.supplierId,
      apiKey: parsed.data.apiKey,
      environment: parsed.data.environment,
      isActive: parsed.data.isActive,
      secretChanged: parsed.data.apiSecret !== SECRET_PLACEHOLDER,
    },
  })

  revalidatePath("/ayarlar")
  revalidatePath("/fiyat-kontrol")

  return { success: true, tested: input.alsoTest, testMessage }
}

export async function testTrendyolConfigAction(): Promise<{
  ok: boolean
  message: string
}> {
  await requireAdmin()
  const config = await prisma.trendyolConfig.findUnique({ where: { id: 1 } })
  if (!config || !config.supplierId || !config.apiKey || !config.apiSecret) {
    return { ok: false, message: "Önce credential'ları kaydet" }
  }
  const test = await testTrendyolConnection({
    supplierId: config.supplierId,
    apiKey: config.apiKey,
    apiSecret: decrypt(config.apiSecret),
    environment: (config.environment as TrendyolEnvironment) ?? "prod",
  })
  await prisma.trendyolConfig.update({
    where: { id: 1 },
    data: {
      lastTestedAt: new Date(),
      lastTestOk: test.ok,
      lastTestNote: test.message,
    },
  })
  revalidatePath("/ayarlar")
  return test
}
