import { z } from "zod"

const percent = z.coerce
  .number()
  .min(0, "0'dan küçük olamaz")
  .max(100, "100'den büyük olamaz")

const aliasesParser = z
  .string()
  .optional()
  .transform((v) => {
    if (!v) return [] as string[]
    return v
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  })

export const brandContactSchema = z.object({
  name: z.string().min(1, "İsim zorunlu").max(100),
  email: z
    .union([z.string().email("Geçersiz e-posta"), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  phone: z
    .string()
    .max(50)
    .optional()
    .transform((v) => (v ? v : undefined)),
  note: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
})

const contactsParser = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return [] as unknown[]
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "İletişim listesi okunamadı" })
      return z.NEVER
    }
  })
  .pipe(z.array(brandContactSchema))

export const brandSchema = z.object({
  name: z.string().min(1, "Marka adı zorunlu").max(100),
  aliases: aliasesParser,
  invoiceDiscount1: percent.default(0),
  invoiceDiscount2: percent.default(0),
  invoiceDiscount3: percent.default(0),
  yearEndDiscount1: percent.default(0),
  yearEndDiscount2: percent.default(0),
  yearEndDiscount3: percent.default(0),
  pharmacyMargin: percent.default(0),
  pharmacyStockRule: z.coerce.number().int().min(0).default(0),
  // Boş = "tümünü aç" (mevcut). Sayı = "kural üstünden en çok N aç" (cap).
  pharmacyOpenAmount: z
    .union([
      z.coerce.number().int().min(0),
      z.literal("").transform(() => null),
      z.null(),
    ])
    .optional()
    .nullable(),
  targetProfit: z
    .union([
      z.coerce.number().min(0).max(99),
      z.literal("").transform(() => null),
      z.null(),
    ])
    .optional()
    .nullable(),
  priceUndercutBuffer: z.coerce.number().min(0).default(0),
  priceUndercutBufferPct: z.coerce.number().min(0).max(50).default(0),
  distributorInfo: z.string().max(500).optional().nullable(),
  contacts: contactsParser,
})

export type BrandFormValues = z.infer<typeof brandSchema>
export type BrandContactValues = z.infer<typeof brandContactSchema>
