import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Pencil,
  Repeat2,
  ScrollText,
  Package,
  Boxes,
  ExternalLink,
  Megaphone,
} from "lucide-react"
import { getProductById, getMergeHistory } from "@/lib/services/product"
import { getLatestBuyboxForProduct } from "@/lib/services/price-recommendation"
import { getActiveCampaignForProduct } from "@/lib/services/campaign"
import { MergeHistorySection } from "./merge-history"
import { ListingsSection } from "./listings-section"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/common/empty-state"
import { formatCurrency, formatNumber, formatDate, formatPercent } from "@/lib/utils"
import { isRecommendationStale } from "@/lib/pricing/stale-recommendation"
import { DeleteButton } from "./delete-button"

export const dynamic = "force-dynamic"

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight,
  icon: Icon,
}: {
  label: string
  value: number
  highlight?: "warning" | "success"
  icon?: React.ComponentType<{ className?: string }>
}) {
  const colorClass = highlight === "warning" ? "text-warning" : ""
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {Icon && <Icon className={`h-4 w-4 ${colorClass}`} />}
        </div>
        <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${colorClass}`}>
          {formatNumber(value)}
        </p>
      </CardContent>
    </Card>
  )
}

const MOVEMENT_LABELS: Record<
  string,
  { label: string; variant: "success" | "destructive" | "warning" | "secondary" | "outline"; sign: "+" | "-" | "±" }
> = {
  IN: { label: "Giriş", variant: "success", sign: "+" },
  OUT: { label: "Çıkış", variant: "destructive", sign: "-" },
  EXCHANGE_OUT: { label: "Takas Veriliş", variant: "warning", sign: "-" },
  EXCHANGE_IN: { label: "Takas Alış", variant: "warning", sign: "+" },
  EXCHANGE_COMPLETE: { label: "Takas Tamam", variant: "secondary", sign: "±" },
  ADJUSTMENT: { label: "Düzeltme", variant: "outline", sign: "±" },
  SET_CONSUMPTION: { label: "Set Tüketim", variant: "outline", sign: "-" },
}

const PRICE_TYPE_LABELS: Record<string, string> = {
  MAIN_PURCHASE: "Ana Alış",
  PSF: "PSF",
  STREET_PURCHASE: "Cadde Alış",
  SALE_CALCULATED: "Satış (Hesaplanan)",
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const productId = Number(id)
  if (!Number.isFinite(productId)) notFound()

  const [product, mergeHistory] = await Promise.all([
    getProductById(productId),
    getMergeHistory(productId),
  ])
  if (!product) notFound()

  const [latestBuybox, activeCampaign] = await Promise.all([
    getLatestBuyboxForProduct(productId),
    getActiveCampaignForProduct(productId),
  ])

  // Merge history serialize (Date → string)
  const mergeHistorySerialized = mergeHistory.map((h) => ({
    ...h,
    mergedBarcodes: h.mergedBarcodes as string[],
    stockTransfer: h.stockTransfer as { mainStock: number; streetStock: number; exchangeStock: number },
    status: h.status as "ACTIVE" | "REVERTED",
    mergedAt: h.mergedAt.toISOString(),
    revertedAt: h.revertedAt?.toISOString() ?? null,
  }))

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/urunler"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Ürünler
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">
              {product.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">{product.primaryBarcode}</span>
              {product.pharmacyProductCode && (
                <span>· Kod: {product.pharmacyProductCode}</span>
              )}
              {product.productType !== "SINGLE" && (
                <Badge variant="secondary">
                  {product.productType === "SET" ? "Set" : "Hediye"}
                </Badge>
              )}
              <Badge variant={product.status === "ACTIVE" ? "success" : "outline"}>
                {product.status === "ACTIVE" ? "Aktif" : "Pasif"}
              </Badge>
              {activeCampaign && (
                <Link href={`/kampanyalar/${activeCampaign.campaignId}`}>
                  <Badge
                    className="gap-1 bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200 hover:bg-pink-200"
                    variant="outline"
                  >
                    <Megaphone className="h-3 w-3" />
                    %{activeCampaign.discountRate} Kampanya
                  </Badge>
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {product.productType === "SET" && (
              <Button variant="outline" asChild>
                <Link href={`/set-urun/${product.id}`}>
                  <ExternalLink className="h-4 w-4" /> Set Detayı
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link
                href={
                  product.productType === "SET"
                    ? `/set-urun/${product.id}/duzenle`
                    : `/urunler/${product.id}/duzenle`
                }
              >
                <Pencil className="h-4 w-4" /> Düzenle
              </Link>
            </Button>
            <DeleteButton id={product.id} name={product.name} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue={product.productType === "SET" ? "bilesenler" : "genel"}
        className="mt-6"
      >
        <TabsList className="w-full sm:w-auto">
          {product.productType === "SET" && (
            <TabsTrigger value="bilesenler">Bileşenler</TabsTrigger>
          )}
          <TabsTrigger value="genel">Genel</TabsTrigger>
          <TabsTrigger value="fiyatlar">Fiyatlar</TabsTrigger>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="hareketler">Stok Hareketleri</TabsTrigger>
          <TabsTrigger value="gecmis">Fiyat Geçmişi</TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="mt-4">
          <ListingsSection productId={product.id} />
        </TabsContent>

        {/* --- BİLEŞENLER TAB (sadece SET) --- */}
        {product.productType === "SET" && (
          <TabsContent value="bilesenler" className="mt-4">
            {product.setComponents.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Bileşen yok. Düzenle sayfasından bileşen ekleyin.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Bileşen Sayısı
                        </p>
                        <Boxes className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-2xl font-bold tabular-nums">
                        {product.setComponents.length}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Sanal Stok
                        </p>
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p
                        className={`mt-1 text-2xl font-bold tabular-nums ${
                          (product.virtualStock ?? 0) === 0
                            ? "text-destructive"
                            : (product.virtualStock ?? 0) < 5
                              ? "text-warning"
                              : ""
                        }`}
                      >
                        {product.virtualStock ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">
                        Hesaplanan Alış
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums">
                        {product.computedPurchasePrice != null
                          ? formatCurrency(
                              product.computedPurchasePrice.toFixed(2)
                            )
                          : "—"}
                      </p>
                      {Number(product.setExtraDiscount ?? 0) > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ek indirim:{" "}
                          {formatCurrency(
                            product.setExtraDiscount!.toString()
                          )}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">PSF</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">
                        {product.psf
                          ? formatCurrency(product.psf.toString())
                          : "—"}
                      </p>
                      {!product.psf && (
                        <p className="mt-1 text-xs text-warning">
                          PSF girilmemiş
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ürün</TableHead>
                          <TableHead className="text-right">Adet</TableHead>
                          <TableHead className="text-right">Stok</TableHead>
                          <TableHead className="text-right">
                            Birim Alış
                          </TableHead>
                          <TableHead className="text-right">Birim PSF</TableHead>
                          <TableHead className="text-right">
                            Ara Toplam
                          </TableHead>
                          <TableHead className="text-right">
                            Üretilebilir
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {product.setComponents.map((sc) => {
                          const unitPrice = sc.component.mainPurchasePrice
                            ? Number(sc.component.mainPurchasePrice)
                            : 0
                          const subtotal = unitPrice * sc.quantity
                          const producible = Math.floor(
                            sc.component.mainStock / sc.quantity
                          )
                          const isBottleneck =
                            producible === (product.virtualStock ?? 0)
                          return (
                            <TableRow key={sc.id}>
                              <TableCell className="font-medium">
                                <Link
                                  href={`/urunler/${sc.component.id}`}
                                  className="flex items-center gap-2 hover:text-primary"
                                >
                                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0">
                                    <div className="truncate">
                                      {sc.component.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground tabular-nums">
                                      {sc.component.primaryBarcode}
                                    </div>
                                  </div>
                                </Link>
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">
                                ×{sc.quantity}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span
                                  className={
                                    sc.component.mainStock === 0
                                      ? "text-destructive font-semibold"
                                      : sc.component.mainStock < sc.quantity
                                        ? "text-warning font-semibold"
                                        : ""
                                  }
                                >
                                  {formatNumber(sc.component.mainStock)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {sc.component.mainPurchasePrice
                                  ? formatCurrency(
                                      sc.component.mainPurchasePrice.toString()
                                    )
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {sc.component.psf
                                  ? formatCurrency(
                                      sc.component.psf.toString()
                                    )
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {unitPrice > 0
                                  ? formatCurrency(subtotal.toFixed(2))
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {isBottleneck ? (
                                  <Badge
                                    variant="warning"
                                    className="tabular-nums"
                                  >
                                    {producible} (darboğaz)
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">
                                    {producible}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        )}

        {/* --- GENEL TAB --- */}
        <TabsContent value="genel" className="mt-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-4">
            <StatCard label="Ana Stok" value={product.mainStock} icon={Package} />
            <StatCard label="Cadde Stok" value={product.streetStock} />
            <StatCard
              label="Takasta"
              value={product.exchangeStock}
              highlight={product.exchangeStock > 0 ? "warning" : undefined}
              icon={Repeat2}
            />
            <StatCard label="Min Stok" value={product.minStock} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Temel Bilgiler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Marka" value={product.brand.name} />
                <InfoRow label="Kategori" value={product.category.name} />
                <InfoRow
                  label="Alt Kategori"
                  value={product.subcategory?.name ?? "—"}
                />
                <InfoRow
                  label="Üretici / Distribütör"
                  value={product.brand.distributorInfo ?? product.manufacturer ?? "—"}
                />
                <InfoRow
                  label="KDV Oranı"
                  value={formatPercent(product.vatRate.toString())}
                />
                <InfoRow label="Raf" value={product.shelf ?? "—"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stok Takibi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow
                  label="Eczane Master Kodu"
                  value={product.pharmacyProductCode ?? "—"}
                />
                <InfoRow label="Min Stok" value={formatNumber(product.minStock)} />
                <InfoRow
                  label="En Yakın Miad"
                  value={
                    product.nearestExpiration
                      ? formatDate(product.nearestExpiration)
                      : "—"
                  }
                />
                <InfoRow
                  label="PAO (ay)"
                  value={product.paoMonths?.toString() ?? "—"}
                />
              </CardContent>
            </Card>
          </div>

          {product.notes && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Notlar</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{product.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Pazaryeri Barkodları — Product alanlarından kanal-bazlı */}
          {(product.trendyolBarcode || product.dopigoBarcode || product.dopigoSku) && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Pazaryeri Kodları</CardTitle>
                <CardDescription>
                  Trendyol ve Dopigo'da bu ürünün karşılığı — manuel eşleştirme ile dolduruldu
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      Trendyol Barkod
                    </div>
                    {product.trendyolBarcode ? (
                      <Badge
                        variant="outline"
                        className="tabular-nums font-mono border-orange-500/40 text-orange-700 dark:text-orange-400"
                      >
                        {product.trendyolBarcode}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">— eşleşme yok</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      Dopigo Tedarikçi Barkod
                    </div>
                    {product.dopigoBarcode ? (
                      <Badge
                        variant="outline"
                        className="tabular-nums font-mono border-blue-500/40 text-blue-700 dark:text-blue-400"
                      >
                        {product.dopigoBarcode}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">— eşleşme yok</span>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Dopigo Ürün Kodu (internal SKU)
                    </div>
                    {product.dopigoSku ? (
                      <Badge variant="outline" className="font-mono">
                        {product.dopigoSku}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mevcut Ek Barkodlar widget'ı — diğer alternatif barkodlar (merge edilmiş ürünlerden) */}
          {product.barcodes.filter((b) => !b.isPrimary && b.source !== "TRENDYOL_AUDIT" && b.source !== "DOPIGO_AUDIT").length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Ek Barkodlar</CardTitle>
                <CardDescription>
                  Birleştirilmiş ürünlerden veya manuel eklenmiş alternatif barkodlar
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {product.barcodes
                  .filter((b) => !b.isPrimary && b.source !== "TRENDYOL_AUDIT" && b.source !== "DOPIGO_AUDIT")
                  .map((b) => (
                    <Badge
                      key={b.id}
                      variant="outline"
                      className="tabular-nums font-mono"
                      title={b.note ?? ""}
                    >
                      {b.barcode}
                    </Badge>
                  ))}
              </CardContent>
            </Card>
          )}

        </TabsContent>

        {/* --- FİYATLAR TAB --- */}
        <TabsContent value="fiyatlar" className="mt-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Ana Alış (KDV dahil)</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatCurrency(product.mainPurchasePrice?.toString() ?? "0")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cadde Alış (KDV hariç)</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatCurrency(product.streetPurchasePrice?.toString() ?? "0")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">PSF</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatCurrency(product.psf?.toString() ?? "0")}
                </p>
              </CardContent>
            </Card>
          </div>

          {activeCampaign && (
            <Card className="mt-4 border-pink-300 bg-pink-50/50 dark:border-pink-800 dark:bg-pink-950/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Aktif Kampanya</CardTitle>
                  <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200" variant="outline">
                    %{activeCampaign.discountRate} iskonto
                  </Badge>
                </div>
                <CardDescription>
                  <Link href={`/kampanyalar/${activeCampaign.campaignId}`} className="hover:underline">
                    {activeCampaign.campaignName}
                  </Link>
                  {" — BuyBox baskısı bu ürüne uygulanmıyor"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">PSF</p>
                    <p className="text-lg font-bold tabular-nums">
                      {product.psf ? formatCurrency(product.psf.toString()) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">İndirim TL</p>
                    <p className="text-lg font-bold tabular-nums text-pink-600">
                      {product.psf
                        ? formatCurrency(
                            ((Number(product.psf) * activeCampaign.discountRate) / 100).toFixed(2)
                          )
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mevcut Alış</p>
                    <p className="text-lg font-bold tabular-nums">
                      {product.mainPurchasePrice
                        ? formatCurrency(product.mainPurchasePrice.toString())
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Kampanyalı Alış</p>
                    <p className="text-lg font-bold tabular-nums text-pink-600">
                      {product.psf && product.mainPurchasePrice
                        ? formatCurrency(
                            Math.max(
                              0,
                              Number(product.mainPurchasePrice) -
                                (Number(product.psf) * activeCampaign.discountRate) / 100
                            ).toFixed(2)
                          )
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {latestBuybox && (
            <Card className="mt-4 border-emerald-500/20 bg-emerald-500/5">
              <CardHeader>
                <CardTitle className="text-base">Trendyol BuyBox</CardTitle>
                <CardDescription>
                  Son gözlem: {formatDate(latestBuybox.observedAt)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">BuyBox Fiyatı</p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatCurrency(latestBuybox.buyboxPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bizim Fiyat</p>
                    <p className="text-lg font-bold tabular-nums">
                      {latestBuybox.ourPrice
                        ? formatCurrency(latestBuybox.ourPrice)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sıra</p>
                    <p className="text-lg font-bold tabular-nums">
                      {latestBuybox.buyboxOrder ?? "—"}
                      {latestBuybox.buyboxOrder === 1 && (
                        <Badge variant="success" className="ml-2 text-[10px]">
                          BuyBox bizde
                        </Badge>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Çoklu Satıcı</p>
                    <p className="text-lg font-bold">
                      {latestBuybox.hasMultipleSeller ? "Evet" : "Hayır"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Marketplace Fiyatları</CardTitle>
              <CardDescription>
                Her pazar yeri için hesaplanan satış fiyatı (Override / Önerilen)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.marketplacePrices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Henüz hesaplanmadı. Alış fiyatı eklenirse otomatik hesaplanır.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Marketplace</TableHead>
                      <TableHead className="text-right">Hesaplanan</TableHead>
                      <TableHead className="text-right">Override</TableHead>
                      <TableHead className="text-right">Önerilen</TableHead>
                      <TableHead className="text-right">Son Güncelleme</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.marketplacePrices.map((mp) => (
                      <TableRow key={mp.id}>
                        <TableCell className="font-medium">
                          {mp.marketplace.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(mp.calculatedPrice.toString())}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {mp.manualOverride ? (
                            <span className="font-medium text-emerald-600">
                              {formatCurrency(mp.manualOverride.toString())}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {mp.recommendedPrice ? (
                            (() => {
                              const stale = isRecommendationStale(
                                mp.recommendedAt ?? null,
                                product.mainPriceUpdatedAt ?? null,
                              )
                              return (
                                <div className="flex flex-col items-end">
                                  <span className={stale ? "text-amber-600 line-through" : ""}>
                                    {formatCurrency(mp.recommendedPrice.toString())}
                                  </span>
                                  {mp.recommendedAt && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {formatDate(mp.recommendedAt)}
                                      {stale && (
                                        <span className="ml-1 text-amber-600 font-medium">
                                          ⚠ BAYAT
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              )
                            })()
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatDate(mp.lastCalculatedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- STOK HAREKETLERİ TAB --- */}
        <TabsContent value="hareketler" className="mt-4">
          {product.stockMovements.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Stok hareketi yok"
              description="Bu ürün için henüz kayıtlı stok hareketi bulunmuyor."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead className="text-right">Miktar</TableHead>
                      <TableHead className="text-right">Birim Fiyat</TableHead>
                      <TableHead>Cari</TableHead>
                      <TableHead>Not</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.stockMovements.map((mv) => {
                      const meta =
                        MOVEMENT_LABELS[mv.type] ?? {
                          label: mv.type,
                          variant: "outline" as const,
                          sign: "±" as const,
                        }
                      const isPositive = meta.sign === "+"
                      const isNegative = meta.sign === "-"
                      const qtyClass = isPositive
                        ? "text-success font-semibold tabular-nums"
                        : isNegative
                          ? "text-destructive font-semibold tabular-nums"
                          : "tabular-nums"
                      const qtyDisplay = isPositive
                        ? `+${formatNumber(mv.quantity)}`
                        : isNegative
                          ? `-${formatNumber(mv.quantity)}`
                          : formatNumber(mv.quantity)

                      return (
                        <TableRow key={mv.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(mv.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell className={`text-right ${qtyClass}`}>
                            {qtyDisplay}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {mv.unitPrice
                              ? formatCurrency(mv.unitPrice.toString())
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {mv.counterparty?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {mv.note ?? "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* --- FİYAT GEÇMİŞİ TAB --- */}
        <TabsContent value="gecmis" className="mt-4">
          {product.priceHistory.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Fiyat geçmişi yok"
              description="Bu ürün için henüz kayıtlı fiyat değişikliği bulunmuyor."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Fiyat Tipi</TableHead>
                      <TableHead className="text-right">Eski</TableHead>
                      <TableHead className="text-right">Girilen</TableHead>
                      <TableHead className="text-right">Yeni (Ort.)</TableHead>
                      <TableHead className="text-right">Değişim</TableHead>
                      <TableHead>Neden</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.priceHistory.map((ph) => {
                      let changeDisplay: React.ReactNode = "—"
                      let changeClass = ""
                      if (ph.oldValue != null && ph.newValue != null) {
                        const pct =
                          ((Number(ph.newValue) - Number(ph.oldValue)) /
                            Number(ph.oldValue)) *
                          100
                        const formatted = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
                        changeClass =
                          pct > 0
                            ? "text-success font-semibold"
                            : pct < 0
                              ? "text-destructive font-semibold"
                              : ""
                        changeDisplay = formatted
                      }

                      const enteredDiffersFromNew =
                        ph.enteredValue != null &&
                        ph.newValue != null &&
                        Math.abs(Number(ph.enteredValue) - Number(ph.newValue)) > 0.0001

                      return (
                        <TableRow key={ph.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(ph.changedAt)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {PRICE_TYPE_LABELS[ph.priceType] ?? ph.priceType}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {ph.oldValue != null
                              ? formatCurrency(ph.oldValue.toString())
                              : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              enteredDiffersFromNew ? "font-medium" : "text-muted-foreground"
                            }`}
                            title={
                              enteredDiffersFromNew
                                ? "Girişte fiilen girilen birim fiyat"
                                : undefined
                            }
                          >
                            {ph.enteredValue != null
                              ? formatCurrency(ph.enteredValue.toString())
                              : "—"}
                          </TableCell>
                          <TableCell
                            className="text-right tabular-nums font-medium"
                            title="Weighted average (ağırlıklı ortalama) sonucu"
                          >
                            {ph.newValue != null
                              ? formatCurrency(ph.newValue.toString())
                              : "—"}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${changeClass}`}>
                            {changeDisplay}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {ph.reason ?? "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Birleştirme Geçmişi */}
      <MergeHistorySection history={mergeHistorySerialized} />
    </div>
  )
}
