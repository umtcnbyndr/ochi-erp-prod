import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getMarketScanStatus } from "@/lib/services/market-scan"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

interface LatestRow {
  barcode: string
  productId: number | null
  productName: string | null
  brandName: string | null
  found: boolean
  buyboxPrice: number | null
  buyboxSeller: string | null
  lowestPrice: number | null
  sellerCount: number
  observedAt: Date
}

function fmtTL(v: number | null): string {
  if (v == null) return "—"
  return `₺${v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export default async function PazarTakipPage() {
  const user = await requirePermission("pazar-takip", "view")
  const allowed = user.allowedBrandIds ?? null

  const status = await getMarketScanStatus()

  // Ürün başına en yeni snapshot (DISTINCT ON) + ürün/marka bilgisi
  const rows = await prisma.$queryRaw<
    Array<{
      barcode: string
      productId: number | null
      productName: string | null
      brandName: string | null
      found: boolean
      buyboxPrice: string | null
      buyboxSeller: string | null
      lowestPrice: string | null
      sellerCount: number
      observedAt: Date
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON (s."barcode")
      s."barcode", s."productId", p."name" AS "productName", b."name" AS "brandName",
      s."found", s."buyboxPrice", s."buyboxSeller", s."lowestPrice",
      s."sellerCount", s."observedAt"
    FROM "MarketPriceSnapshot" s
    LEFT JOIN "Product" p ON p."id" = s."productId"
    LEFT JOIN "Brand" b ON b."id" = p."brandId"
    ${allowed && allowed.length > 0 ? Prisma.sql`WHERE p."brandId" IN (${Prisma.join(allowed)})` : Prisma.empty}
    ORDER BY s."barcode", s."observedAt" DESC
  `)

  const data: LatestRow[] = rows.map((r) => ({
    barcode: r.barcode,
    productId: r.productId,
    productName: r.productName,
    brandName: r.brandName,
    found: r.found,
    buyboxPrice: r.buyboxPrice != null ? Number(r.buyboxPrice) : null,
    buyboxSeller: r.buyboxSeller,
    lowestPrice: r.lowestPrice != null ? Number(r.lowestPrice) : null,
    sellerCount: r.sellerCount,
    observedAt: r.observedAt,
  }))

  const foundCount = data.filter((d) => d.found).length
  const lastRun = status.lastRun

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pazar Fiyat Takip"
        description="Trendyol'da bizde açık olsun olmasın ürünlerin BuyBox + ilk 5 satıcı fiyatı. Tarayıcı worker günde 2-3 tur otomatik günceller."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Son Tarama</CardTitle>
          </CardHeader>
          <CardContent>
            {lastRun ? (
              <div className="space-y-1">
                <div className="text-lg font-semibold">
                  <Badge variant={lastRun.status === "SUCCESS" ? "default" : lastRun.status === "FAILED" ? "destructive" : "secondary"}>
                    {lastRun.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtDate(lastRun.startedAt)} · {lastRun.totalFound}/{lastRun.totalScanned} bulundu
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Henüz tarama yok</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Takip Edilen Barkod</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{status.distinctBarcodeCount}</div>
            <div className="text-xs text-muted-foreground">{foundCount} tanesi TY'de bulundu</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Toplam Gözlem</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{status.snapshotCount}</div>
            <div className="text-xs text-muted-foreground">zaman serisi (geçmiş korunur)</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün / Barkod</TableHead>
                <TableHead>Marka</TableHead>
                <TableHead className="text-right">BuyBox</TableHead>
                <TableHead>BuyBox Satıcı</TableHead>
                <TableHead className="text-right">En Düşük</TableHead>
                <TableHead className="text-right">Satıcı</TableHead>
                <TableHead>Son Gözlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    Henüz veri yok — worker ilk turunu tamamlayınca burada görünecek.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((r) => (
                  <TableRow key={r.barcode} className={!r.found ? "opacity-50" : ""}>
                    <TableCell className="text-sm">
                      <div className="truncate max-w-[280px]" title={r.productName ?? ""}>
                        {r.productName ?? <span className="italic text-muted-foreground">bizde yok</span>}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">{r.barcode}</div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{r.brandName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">
                      {r.found ? fmtTL(r.buyboxPrice) : <span className="text-xs text-muted-foreground">bulunamadı</span>}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{r.buyboxSeller ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtTL(r.lowestPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.found ? r.sellerCount : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.observedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
