import { z } from "zod"

const percent = z.coerce
  .number()
  .min(0, "0'dan küçük olamaz")
  .max(100, "100'den büyük olamaz")

export const brandSchema = z.object({
  name: z.string().min(1, "Marka adı zorunlu").max(100),
  invoiceDiscount1: percent.default(0),
  invoiceDiscount2: percent.default(0),
  invoiceDiscount3: percent.default(0),
  yearEndDiscount1: percent.default(0),
  yearEndDiscount2: percent.default(0),
  yearEndDiscount3: percent.default(0),
  pharmacyMargin: percent.default(0),
  pharmacyStockRule: z.coerce.number().int().min(0).default(0),
  distributorInfo: z.string().max(500).optional().nullable(),
  contactInfo: z.string().max(500).optional().nullable(),
})

export type BrandFormValues = z.infer<typeof brandSchema>
