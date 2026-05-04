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

const vatRate = z.coerce.number().min(0).max(100)

export const setComponentSchema = z.object({
  componentId: z.coerce.number().int().positive("Bileşen seçmelisiniz"),
  quantity: z.coerce.number().int().min(1, "Adet en az 1 olmalı"),
})

export const setProductSchema = z.object({
  name: z.string().trim().min(1, "Set adı zorunlu").max(300),
  primaryBarcode: z.string().trim().min(1, "Set barkodu zorunlu").max(100),
  setSku: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  // Pazaryeri kodları (set ürünleri için de geçerli)
  trendyolBarcode: optionalString,
  dopigoBarcode: optionalString,
  dopigoSku: optionalString,
  brandId: z.coerce.number().int().positive("Marka seçmelisiniz"),
  categoryId: z.coerce.number().int().positive("Kategori seçmelisiniz"),
  subcategoryId: z
    .union([z.coerce.number().int().positive(), z.literal("").transform(() => null), z.null()])
    .optional()
    .nullable(),
  vatRate,
  setExtraDiscount: optionalPositiveNumber,
  psf: optionalPositiveNumber,
  manufacturer: optionalString,
  shelf: optionalString,
  notes: optionalString,
  status: z.enum(["ACTIVE", "PASSIVE"]).default("ACTIVE"),
  components: z
    .array(setComponentSchema)
    .min(1, "En az bir bileşen eklemelisiniz")
    .refine(
      (arr) => {
        const ids = arr.map((c) => c.componentId)
        return new Set(ids).size === ids.length
      },
      { message: "Aynı bileşen birden fazla eklenemez" }
    ),
})

export type SetProductFormValues = z.infer<typeof setProductSchema>
export type SetComponentInput = z.infer<typeof setComponentSchema>
