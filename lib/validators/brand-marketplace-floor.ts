import { z } from "zod"

/**
 * Tek bir marka × marketplace floor satırı.
 * multiplier: 0 < x ≤ 2 (0.5 = TY'nin yarısı, 1.5 = TY'nin %50 üstü).
 * isEnabled=false ise multiplier göz ardı edilir.
 */
export const FloorRowInputSchema = z.object({
  marketplaceId: z.number().int().positive(),
  multiplier: z
    .number()
    .positive("Multiplier 0'dan büyük olmalı")
    .max(2, "Multiplier 2.0'dan büyük olamaz")
    .refine((v) => Number.isFinite(v), "Geçerli sayı değil"),
  isEnabled: z.boolean(),
  notes: z.string().max(500).nullable().optional(),
})

export const SaveFloorsForBrandSchema = z.object({
  brandId: z.number().int().positive(),
  rows: z.array(FloorRowInputSchema).max(50),
})

export type FloorRowInput = z.infer<typeof FloorRowInputSchema>
export type SaveFloorsForBrandInput = z.infer<typeof SaveFloorsForBrandSchema>
