import { z } from "zod"

const percent = z.coerce
  .number()
  .min(0, "0'dan küçük olamaz")
  .max(99, "99'dan büyük olamaz")

// Optional decimal — bos string'i null'a cevirir
const optionalDecimal = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  })

export const marketplaceSchema = z.object({
  name: z.string().min(1, "Pazar yeri adı zorunlu").max(100),
  commissionRate: percent.default(0),
  shippingCost: z.coerce.number().min(0, "0'dan küçük olamaz").default(0),
  extraCost: z.coerce.number().min(0, "0'dan küçük olamaz").default(0),
  withholdingTax: percent.default(0),
  targetProfit: percent.default(0),
  defaultUndercutBuffer: optionalDecimal,
  defaultUndercutBufferPct: optionalDecimal,
  minProfitFloor: optionalDecimal,
  isActive: z.coerce.boolean().default(true),
})

export type MarketplaceFormValues = z.infer<typeof marketplaceSchema>
