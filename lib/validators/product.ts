import { z } from "zod"

const optionalString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v === "" ? null : v))

const optionalPositiveNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : Number(v)))
  .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Negatif olamaz")

const nonNegativeInt = z.coerce
  .number()
  .int("Tam sayı olmalı")
  .min(0, "Negatif olamaz")

const vatRate = z.coerce
  .number()
  .min(0)
  .max(100)

export const productSchema = z.object({
  name: z.string().trim().min(1, "Ürün adı zorunlu").max(300),
  primaryBarcode: z.string().trim().min(1, "Ana barkod zorunlu").max(100),
  additionalBarcodes: z
    .array(z.string().trim().min(1).max(100))
    .optional()
    .default([]),
  brandId: z.coerce.number().int().positive("Marka seçmelisiniz"),
  categoryId: z.coerce.number().int().positive("Kategori seçmelisiniz"),
  subcategoryId: z
    .union([z.coerce.number().int().positive(), z.literal("").transform(() => null), z.null()])
    .optional()
    .nullable(),
  vatRate,
  productType: z.enum(["SINGLE", "SET", "GIFT"]).default("SINGLE"),

  pharmacyProductCode: optionalString,
  mainStock: nonNegativeInt.default(0),
  mainPurchasePrice: optionalPositiveNumber,
  streetStock: nonNegativeInt.default(0),
  streetPurchasePrice: optionalPositiveNumber,
  psf: optionalPositiveNumber,
  manufacturer: optionalString,
  minStock: nonNegativeInt.default(0),
  shelf: optionalString,
  status: z.enum(["ACTIVE", "PASSIVE"]).default("ACTIVE"),
  nearestExpiration: z
    .union([z.string(), z.date(), z.null(), z.literal("")])
    .optional()
    .transform((v) => (v == null || v === "" ? null : new Date(v))),
  paoMonths: z
    .union([z.coerce.number().int().min(0), z.literal("").transform(() => null), z.null()])
    .optional()
    .nullable(),
  notes: optionalString,
})

export type ProductFormValues = z.infer<typeof productSchema>
