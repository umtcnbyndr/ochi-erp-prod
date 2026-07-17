import { redirect } from "next/navigation"
import { getAuthUser } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { getUnmatchedDopigoItems } from "@/lib/services/manual-purchase-price"
import { EksikAlisFlow } from "./eksik-alis-flow"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>
}

function defaultRange(): { from: string; to: string } {
  // Bu ayın 1'i — bugünün 23:59'u (TR locale)
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { from: fmt(first), to: fmt(last) }
}

export default async function EksikAlisPage({ searchParams }: Props) {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  // Granüler izin: ADMIN full erişim + finans-eksik-alis izni olan (ör. MANAGER)
  if (!user.permissions["finans-eksik-alis"]?.canView) redirect("/panel")

  const sp = await searchParams
  const def = defaultRange()
  const fromStr = sp.from ?? def.from
  const toStr = sp.to ?? def.to

  // Parse to actual Date objects (YYYY-MM-DD → start/end of day)
  const fromDate = new Date(fromStr + "T00:00:00")
  const toDate = new Date(toStr + "T23:59:59")

  const items = await getUnmatchedDopigoItems({ fromDate, toDate })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Eksik Alış Fiyatları"
        description="Sistemde eşleşmemiş Dopigo satışları için manuel alış girişi. Aylık kâr hesabı için gerekli. Bir kez girince ileride de geçerli (SKU/barkod bazlı lookup)."
      />
      <EksikAlisFlow
        items={items.map((i) => ({ ...i }))}
        defaultFrom={fromStr}
        defaultTo={toStr}
      />
    </div>
  )
}
