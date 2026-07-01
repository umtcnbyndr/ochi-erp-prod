import { redirect } from "next/navigation"
import { getAuthUser } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/db"
import { TrendyolReconciliationFlow } from "./trendyol-flow"
import { MarketplaceReconciliationFlow } from "./marketplace-flow"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export default async function MutabakatPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (user.role !== "ADMIN") redirect("/panel")

  // Mutabakatlı aylar — pazaryeri bazlı özet
  const grouped = await prisma.trendyolOrderReconciliation.groupBy({
    by: ["marketplace", "month"],
    _count: { _all: true },
    _sum: { saleAmount: true, netReceived: true },
    orderBy: { month: "desc" },
  })
  const monthsFor = (mp: string) =>
    grouped.filter((g) => g.marketplace === mp).slice(0, 6)
  const months = monthsFor("Trendyol")

  return (
    <div className="space-y-4">
      <PageHeader
        title="Aylık Mutabakat"
        description="Pazaryeri panelinden indirilen Excel'leri yükle, gerçek komisyon/kargo/platform ücreti ile aylık net kâr hesabını doğrula. Mutabakatı olan aylar raporlarda gerçek değerlerle, olmayanlar tahminle gösterilir."
      />

      <Tabs defaultValue="trendyol">
        <TabsList>
          <TabsTrigger value="trendyol">Trendyol</TabsTrigger>
          <TabsTrigger value="farmazon">Farmazon</TabsTrigger>
          <TabsTrigger value="hepsiburada" disabled>
            Hepsiburada <Badge variant="outline" className="ml-1 text-[9px]">Yakında</Badge>
          </TabsTrigger>
          <TabsTrigger value="n11" disabled>
            N11 <Badge variant="outline" className="ml-1 text-[9px]">Yakında</Badge>
          </TabsTrigger>
          <TabsTrigger value="amazon" disabled>
            Amazon <Badge variant="outline" className="ml-1 text-[9px]">Yakında</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trendyol" className="space-y-4 pt-4">
          <MonthSummary rows={months} />
          <TrendyolReconciliationFlow />
        </TabsContent>

        <TabsContent value="farmazon" className="space-y-4 pt-4">
          <MonthSummary rows={monthsFor("Farmazon")} />
          <MarketplaceReconciliationFlow marketplace="Farmazon" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MonthSummary({
  rows,
}: {
  rows: { month: string; _count: { _all: number }; _sum: { netReceived: unknown } }[]
}) {
  if (rows.length === 0) return null
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium mb-2">Mutabakatı yapılmış aylar:</p>
        <div className="flex flex-wrap gap-2">
          {rows.map((m) => (
            <Badge key={m.month} variant="outline" className="gap-1.5">
              <span className="font-semibold">{m.month}</span>
              <span className="text-muted-foreground">
                · {m._count._all} sipariş · Net{" "}
                {Number(m._sum.netReceived ?? 0).toLocaleString("tr-TR", {
                  style: "currency",
                  currency: "TRY",
                  maximumFractionDigits: 0,
                })}
              </span>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
