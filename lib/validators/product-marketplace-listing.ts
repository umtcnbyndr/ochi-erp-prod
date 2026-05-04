import { z } from "zod"

const optionalTrimmed = z
  .string()
  .max(120)
  .nullable()
  .optional()
  .transform((v) => (v ? v.trim() : v))

export const CreateListingSchema = z.object({
  productId: z.number().int().positive(),
  marketplaceId: z.number().int().positive(),
  barcode: optionalTrimmed,
  sku: optionalTrimmed,
  externalCode: optionalTrimmed,
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  shareStock: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export const UpdateListingSchema = z.object({
  id: z.number().int().positive(),
  barcode: optionalTrimmed,
  sku: optionalTrimmed,
  externalCode: optionalTrimmed,
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  shareStock: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export const DeleteListingSchema = z.object({
  id: z.number().int().positive(),
})

export type CreateListingDto = z.infer<typeof CreateListingSchema>
export type UpdateListingDto = z.infer<typeof UpdateListingSchema>
