import { requirePermission } from "@/lib/permissions"
import { buildDopigoStockAlertReport } from "@/lib/services/dopigo-stock-alerts"
import { PageHeader } from "@/components/common/page-header"
import { StockAlertsFlow } from "./stock-alerts-flow"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Dopigo'dan 2594 ürün pagination ~10-20sn

export default async function StokUyarilariPage() {
  const user = await requirePermission("stok-uyarilari", "view")

  let report: Awaited<ReturnType<typeof buildDopigoStockAlertReport>> | null = null
  let errorMessage: string | null = null

  try {
    report = await buildDopigoStockAlertReport({
      // SALES kullanıcıları için marka kısıtı
      brandIds: user.allowedBrandIds ?? undefined,
    })
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Dopigo'ya bağlanılamadı"
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stok Uyarıları"
        description="Sistem efektif stoğu vs Dopigo depot stoğu. Fark varsa düzeltmek için Dopigo'ya push edebilirsin."
      />

      {errorMessage ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Bağlantı hatası</p>
          <p className="text-xs mt-1 text-muted-foreground">{errorMessage}</p>
        </div>
      ) : report ? (
        <StockAlertsFlow
          rows={report.rows.map((r) => ({ ...r }))}
          totals={report.totals}
          generatedAt={report.generatedAt.toISOString()}
          canEdit={user.permissions["stok-uyarilari"]?.canEdit ?? user.role === "ADMIN"}
        />
      ) : null}
    </div>
  )
}
