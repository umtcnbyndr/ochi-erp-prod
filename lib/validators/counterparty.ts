import { z } from "zod"

export const counterpartySchema = z.object({
  name: z.string().min(1, "Ad zorunlu").max(200),
  type: z.enum(["PHARMACY", "DISTRIBUTOR", "INDIVIDUAL"]),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

export type CounterpartyFormValues = z.infer<typeof counterpartySchema>
