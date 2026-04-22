import { z } from "zod"

export const categorySchema = z.object({
  name: z.string().min(1, "Kategori adı zorunlu").max(100),
})

export const subcategorySchema = z.object({
  name: z.string().min(1, "Alt kategori adı zorunlu").max(100),
  categoryId: z.coerce.number().int().positive("Kategori seçmelisiniz"),
})

export type CategoryFormValues = z.infer<typeof categorySchema>
export type SubcategoryFormValues = z.infer<typeof subcategorySchema>
