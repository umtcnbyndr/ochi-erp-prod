import { z } from "zod"

// Virgül veya satır sonu ile ayrılmış alias string'ini trim'li + boşsuzlanmış array'e çevirir
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

export const categorySchema = z.object({
  name: z.string().min(1, "Kategori adı zorunlu").max(100),
  aliases: aliasesParser,
})

export const subcategorySchema = z.object({
  name: z.string().min(1, "Alt kategori adı zorunlu").max(100),
  categoryId: z.coerce.number().int().positive("Kategori seçmelisiniz"),
  aliases: aliasesParser,
})

export type CategoryFormValues = z.infer<typeof categorySchema>
export type SubcategoryFormValues = z.infer<typeof subcategorySchema>
