import { z } from "zod"

const percent = z.coerce
  .number()
  .min(0, "0'dan küçük olamaz")
  .max(99, "99'dan büyük olamaz")

export const marketplaceSchema = z.object({
  name: z.string().min(1, "Pazar yeri adı zorunlu").max(100),
  commissionRate: percent.default(0),
  shippingCost: z.coerce.number().min(0, "0'dan küçük olamaz").default(0),
  withholdingTax: percent.default(0),
  targetProfit: percent.default(0),
  isActive: z.coerce.boolean().default(true),
})

export type MarketplaceFormValues = z.infer<typeof marketplaceSchema>
