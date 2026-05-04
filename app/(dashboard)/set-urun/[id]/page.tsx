import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Pencil,
  Package,
  Boxes,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
} from "lucide-react"
import { getSetById } from "@/lib/services/set-product"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
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
import { formatCurrency, formatNumber, formatDate, formatPercent } from "@/lib/utils"
import { DeleteSetButton } from "./delete-set-button"
import { RecalculateButton } from "./recalculate-button"

export const dynamic = "force-dynamic"

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

const PRICE_TYPE_LABELS: Record<string, string> = {
  MAIN_PURCHASE: "Ana Alış",
  PSF: "PSF",
  STREET_PURCHASE: "Cadde Alış",
  SALE_CALCULATED: "Satış (Hesaplanan)",
}

export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const setId = Number(id)
  if (!Number.isFinite(setId)) notFound()

  const set = await getSetById(setId)
  if (!set) notFound()

  // Kayıtlı alış ve hesaplanmış alış farkı (stale detection)
  const storedPrice = set.mainPurchasePrice ? Number(set.mainPurchasePrice) : 0
  const computedPrice = set.computedPurchasePrice
  const isPriceStale = Math.abs(storedPrice - computedPrice) > 0.01

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/set-urun"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Setler
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">
              {set.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">{set.primaryBarcode}</span>
              {set.setSku && <span>· SKU: {set.setSku}</span>}
              <Badge variant="secondary">Set</Badge>
              <Badge variant={set.status === "ACTIVE" ? "success" : "outline"}>
                {set.status === "ACTIVE" ? "Aktif" : "Pasif"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RecalculateButton id={set.id} stale={isPriceStale} />
            <Button variant="outline" asChild>
              <Link href={`/set-urun/${set.id}/duzenle`}>
                <Pencil className="h-4 w-4" /> Düzenle
              </Link>
            </Button>
            <DeleteSetButton id={set.id} name={set.name} />
          </div>
        </div>
      </div>

      {/* Stale warning */}
      {isPriceStale && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="font-medium">Set fiyatı güncel değil</p>
            <p className="text-muted-foreground">
              Kayıtlı alış fiyatı <strong>{formatCurrency(storedPrice.toFixed(2))}</strong> iken
              bileşenlerden hesaplanan değer{" "}
              <strong>{formatCurrency(computedPrice.toFixed(2))}</strong>. Bileşen
              fiyatları değişmiş olabilir — &quot;Yeniden Hesapla&quot; butonuna basarak
              güncelleyin (marketplace fiyatları da yeniden hesaplanır).
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Bileşen Sayısı</p>
              <Boxes className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
              {set.setComponents.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Sanal Stok</p>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${
                set.availableStock === 0
                  ? "text-destructive"
                  : set.availableStock < 5
                    ? "text-warning"
                    : ""
              }`}
            >
              {set.availableStock}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Hesaplanan Alış</p>
            <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
              {formatCurrency(computedPrice.toFixed(2))}
            </p>
            {Number(set.setExtraDiscount ?? 0) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ek indirim: {formatCurrency(set.setExtraDiscount!.toString())}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">PSF</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
              {set.psf ? formatCurrency(set.psf.toString()) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bilesenler" className="mt-2">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="bilesenler">Bileşenler</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace Fiyatları</TabsTrigger>
          <TabsTrigger value="genel">Genel</TabsTrigger>
          <TabsTrigger value="gecmis">Fiyat Geçmişi</TabsTrigger>
        </TabsList>

        {/* --- BİLEŞENLER --- */}
        <TabsContent value="bilesenler" className="mt-4">
          {set.setComponents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Henüz bileşen yok.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün</TableHead>
                      <TableHead className="text-right">Adet</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right">Birim Alış</TableHead>
                      <TableHead className="text-right">Birim PSF</TableHead>
                      <TableHead className="text-right">Ara Toplam (Alış)</TableHead>
                      <TableHead className="text-right">Üretilebilir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {set.setComponents.map((sc) => {
                      const unitPrice = sc.component.mainPurchasePrice
                        ? Number(sc.component.mainPurchasePrice)
                        : 0
                      const subtotal = unitPrice * sc.quantity
                      const producible = Math.floor(
                        sc.component.mainStock / sc.quantity
                      )
                      const isBottleneck = producible === set.availableStock
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
                              ? formatCurrency(sc.component.psf.toString())
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {unitPrice > 0
                              ? formatCurrency(subtotal.toFixed(2))
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {isBottleneck ? (
                              <Badge variant="warning" className="tabular-nums">
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
          )}

          {/* Ek indirim + toplam özeti */}
          {set.setComponents.length > 0 && (
            <Card className="mt-4">
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bileşenler Toplamı</span>
                  <span className="tabular-nums">
                    {formatCurrency(
                      (
                        computedPrice + Number(set.setExtraDiscount ?? 0)
                      ).toFixed(2)
                    )}
                  </span>
                </div>
                {Number(set.setExtraDiscount ?? 0) > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Ek İndirim</span>
                    <span className="tabular-nums">
                      −{formatCurrency(set.setExtraDiscount!.toString())}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Set Alış Fiyatı</span>
                  <span className="tabular-nums">
                    {formatCurrency(computedPrice.toFixed(2))}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* --- MARKETPLACE FIYATLARI --- */}
        <TabsContent value="marketplace" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marketplace Satış Fiyatları</CardTitle>
              <CardDescription>
                Her pazar yeri için otomatik hesaplanmış satış fiyatı. Alış
                değişirse yeniden hesapla butonunu kullanın.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {set.marketplacePrices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Henüz hesaplanmadı. Alış fiyatı oluşursa otomatik hesaplanır.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Marketplace</TableHead>
                      <TableHead className="text-right">Hesaplanan</TableHead>
                      <TableHead className="text-right">Override</TableHead>
                      <TableHead className="text-right">Son Güncelleme</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {set.marketplacePrices.map((mp) => (
                      <TableRow key={mp.id}>
                        <TableCell className="font-medium">
                          {mp.marketplace.name}
                          {!mp.marketplace.isActive && (
                            <Badge variant="outline" className="ml-2">
                              Pasif
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(mp.calculatedPrice.toString())}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {mp.manualOverride
                            ? formatCurrency(mp.manualOverride.toString())
                            : "—"}
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

        {/* --- GENEL --- */}
        <TabsContent value="genel" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Temel Bilgiler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Marka" value={set.brand.name} />
                <InfoRow label="Kategori" value={set.category.name} />
                <InfoRow
                  label="Alt Kategori"
                  value={set.subcategory?.name ?? "—"}
                />
                <InfoRow
                  label="KDV Oranı"
                  value={formatPercent(set.vatRate.toString())}
                />
                <InfoRow label="Raf" value={set.shelf ?? "—"} />
                <InfoRow
                  label="Ek İndirim"
                  value={
                    set.setExtraDiscount
                      ? formatCurrency(set.setExtraDiscount.toString())
                      : "—"
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fiyat Özeti</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow
                  label="Kayıtlı Alış"
                  value={
                    storedPrice > 0
                      ? formatCurrency(storedPrice.toFixed(2))
                      : "—"
                  }
                />
                <InfoRow
                  label="Hesaplanan Alış"
                  value={
                    <span
                      className={
                        isPriceStale
                          ? "text-warning font-semibold"
                          : undefined
                      }
                    >
                      {formatCurrency(computedPrice.toFixed(2))}
                    </span>
                  }
                />
                <InfoRow
                  label="PSF"
                  value={set.psf ? formatCurrency(set.psf.toString()) : "—"}
                />
              </CardContent>
            </Card>
          </div>

          {set.notes && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Notlar</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{set.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Pazaryeri Kodları — set ürünü için */}
          {(set.trendyolBarcode || set.dopigoBarcode || set.dopigoSku) && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Pazaryeri Kodları</CardTitle>
                <CardDescription>
                  Set ürününün Trendyol ve Dopigo'daki karşılığı
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      Trendyol Barkod
                    </div>
                    {set.trendyolBarcode ? (
                      <Badge
                        variant="outline"
                        className="tabular-nums font-mono border-orange-500/40 text-orange-700 dark:text-orange-400"
                      >
                        {set.trendyolBarcode}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      Dopigo Tedarikçi Barkod
                    </div>
                    {set.dopigoBarcode ? (
                      <Badge
                        variant="outline"
                        className="tabular-nums font-mono border-blue-500/40 text-blue-700 dark:text-blue-400"
                      >
                        {set.dopigoBarcode}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Dopigo Ürün Kodu
                    </div>
                    {set.dopigoSku ? (
                      <Badge variant="outline" className="font-mono">
                        {set.dopigoSku}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* --- FİYAT GEÇMİŞİ --- */}
        <TabsContent value="gecmis" className="mt-4">
          {set.priceHistory.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Fiyat geçmişi yok.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead className="text-right">Eski</TableHead>
                      <TableHead className="text-right">Yeni</TableHead>
                      <TableHead>Neden</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {set.priceHistory.map((ph) => (
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
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(ph.newValue.toString())}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ph.reason ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
