import { redirect } from "next/navigation"
import { getAuthUser } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/db"
import { TrendyolReconciliationFlow } from "./trendyol-flow"
import { MarketplaceReconciliationFlow } from "./marketplace-flow"
import { N11ReconciliationFlow } from "./n11-flow"
import type { MonthlyReconData } from "./monthly-recon-table"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export default async function MutabakatPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (user.role !== "ADMIN") redirect("/panel")

  // Aylık mutabakat tablosu — pazaryeri bazlı, tüm yıllar
  const grouped = await prisma.trendyolOrderReconciliation.groupBy({
    by: ["marketplace", "month"],
    _count: { _all: true },
    _sum: {
      commission: true,
      shipping: true,
      returnShipping: true,
      withholding: true,
      platformFee: true,
      penalty: true,
      otherDeductions: true,
      internationalFee: true,
    },
    _max: { importedAt: true },
    orderBy: { month: "desc" },
  })
  const monthlyDataFor = (mp: string): MonthlyReconData[] =>
    grouped
      .filter((g) => g.marketplace === mp)
      .map((g) => ({
        month: g.month,
        count: g._count._all,
        commission: Number(g._sum.commission ?? 0),
        shipping: Number(g._sum.shipping ?? 0) + Number(g._sum.returnShipping ?? 0),
        withholding: Number(g._sum.withholding ?? 0),
        other:
          Number(g._sum.platformFee ?? 0) +
          Number(g._sum.penalty ?? 0) +
          Number(g._sum.otherDeductions ?? 0) +
          Number(g._sum.internationalFee ?? 0),
        lastImportedAt: g._max.importedAt ? g._max.importedAt.toISOString() : null,
      }))

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
          <TabsTrigger value="hepsiburada">Hepsiburada</TabsTrigger>
          <TabsTrigger value="n11">N11</TabsTrigger>
          <TabsTrigger value="pazarama">Pazarama</TabsTrigger>
          <TabsTrigger value="amazon" disabled>
            Amazon <Badge variant="outline" className="ml-1 text-[9px]">Yakında</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trendyol" className="space-y-4 pt-4">
          <TrendyolReconciliationFlow monthlyData={monthlyDataFor("Trendyol")} />
        </TabsContent>

        <TabsContent value="farmazon" className="space-y-4 pt-4">
          <MarketplaceReconciliationFlow
            marketplace="Farmazon"
            monthlyData={monthlyDataFor("Farmazon")}
            downloadInstructions={
              'Farmazon panel → sağ üstte "Satış Panelim" yanındaki kullanıcı menüsü → Hesap Hareketlerim → sol menüden Raporlar → tarih aralığı seç → Sipariş Raporu indir → burada yükle.'
            }
          />
        </TabsContent>

        <TabsContent value="hepsiburada" className="space-y-4 pt-4">
          <MarketplaceReconciliationFlow
            marketplace="Hepsiburada"
            monthlyData={monthlyDataFor("Hepsiburada")}
            hasOwnShipping
            downloadInstructions={
              'Hepsiburada panel → Muhasebe → Sipariş Kayıtları → tarih aralığı seç → indir → burada yükle. Dikkat: bazı siparişler henüz tamamlanmadıysa "giderler" (komisyon/kargo/stopaj) kolonları boş gelebilir — indirmeden önce dolu olduklarını kontrol et.'
            }
          />
        </TabsContent>

        <TabsContent value="n11" className="space-y-4 pt-4">
          <N11ReconciliationFlow monthlyData={monthlyDataFor("N11")} />
        </TabsContent>

        <TabsContent value="pazarama" className="space-y-4 pt-4">
          <MarketplaceReconciliationFlow
            marketplace="Pazarama"
            monthlyData={monthlyDataFor("Pazarama")}
            downloadInstructions={
              'Pazarama satıcı paneli → Siparişlerim → tarih aralığı seç → Dışarı Aktar (Siparişleriniz_*.xlsx) → burada yükle. Komisyon ve satıcı kampanyası dosyadan gerçek okunur; stopaj raporda olmadığı için tahminle (ciro × oran) devam eder, kargo sipariş başı girilir.'
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
