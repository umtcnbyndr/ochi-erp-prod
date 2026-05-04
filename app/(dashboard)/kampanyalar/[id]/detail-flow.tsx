"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  Package,
  Receipt,
  AlertCircle,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/common/empty-state"
import {
  endCampaignAction,
  cancelCampaignAction,
  deleteCampaignAction,
  collectCampaignAction,
} from "../actions"

interface Sale {
  id: number
  productId: number
  productName: string
  productBarcode: string
  quantity: number
  psfSnapshot: number
  unitPurchaseSnapshot: number
  discountAmountTL: number
  saleDate: string
  source: string
}

interface Campaign {
  id: number
  name: string
  type: "BRAND" | "PRODUCTS"
  brandId: number | null
  brandName: string | null
  discountRate: number
  startDate: string
  endDate: string
  status: "ACTIVE" | "ENDED" | "COLLECTED" | "CANCELLED"
  collectionDueDate: string | null
  collectedAt: string | null
  collectionInvoiceNo: string | null
  collectedAmount: number | null
  notes: string | null
  createdAt: string
  endedAt: string | null
  sales: Sale[]
}

interface Product {
  id: number
  name: string
  primaryBarcode: string
  psf: number | null
  mainPurchasePrice: number | null
}

interface Props {
  campaign: Campaign
  products: Product[]
  isAdmin: boolean
}

export function CampaignDetailFlow({ campaign, products, isAdmin }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [collectOpen, setCollectOpen] = useState(false)
  const [invoiceNo, setInvoiceNo] = useState("")
  const [collectedAmount, setCollectedAmount] = useState("")

  // Ürün bazlı satış agregasyonu (tahsilat detay raporu)
  const salesByProduct = useMemo(() => {
    const map = new Map<
      number,
      {
        productId: number
        productName: string
        productBarcode: string
        totalQty: number
        totalDiscount: number
        avgPsf: number
      }
    >()
    for (const s of campaign.sales) {
      const existing = map.get(s.productId)
      if (existing) {
        existing.totalQty += s.quantity
        existing.totalDiscount += s.discountAmountTL
        // weighted PSF average
        existing.avgPsf =
          (existing.avgPsf * (existing.totalQty - s.quantity) + s.psfSnapshot * s.quantity) /
          existing.totalQty
      } else {
        map.set(s.productId, {
          productId: s.productId,
          productName: s.productName,
          productBarcode: s.productBarcode,
          totalQty: s.quantity,
          totalDiscount: s.discountAmountTL,
          avgPsf: s.psfSnapshot,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalDiscount - a.totalDiscount)
  }, [campaign.sales])

  const totalDiscount = campaign.sales.reduce(
    (s, x) => s + x.discountAmountTL,
    0,
  )
  const totalQty = campaign.sales.reduce((s, x) => s + x.quantity, 0)

  function handleEnd() {
    if (!confirm("Kampanya bitirilecek. Devam?")) return
    startTransition(async () => {
      const result = await endCampaignAction(campaign.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Kampanya bitirildi — Dopigo aktarımdan eski fiyatlara döndür Excel'i indir")
      router.refresh()
    })
  }

  function handleDelete() {
    if (
      !confirm(
        `"${campaign.name}" kampanyası tamamen silinecek.\n\nBuna bağlı tüm satış kayıtları (CampaignSale) ve ürün bağlantıları (CampaignProduct) da silinir.\n\nBu işlem GERİ ALINAMAZ.\n\nDevam etmek için tamam'a bas.`,
      )
    )
      return
    startTransition(async () => {
      const result = await deleteCampaignAction(campaign.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Kampanya silindi")
      router.push("/kampanyalar")
    })
  }

  function handleCancel() {
    if (!confirm("Kampanya iptal edilecek. Bu işlem geri alınamaz. Devam?")) return
    startTransition(async () => {
      const result = await cancelCampaignAction(campaign.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Kampanya iptal edildi")
      router.refresh()
    })
  }

  function handleCollect() {
    if (!invoiceNo.trim()) {
      toast.error("Fatura no zorunlu")
      return
    }
    const amount = parseFloat(collectedAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Geçerli bir tutar girin")
      return
    }
    startTransition(async () => {
      const result = await collectCampaignAction({
        id: campaign.id,
        collectionInvoiceNo: invoiceNo.trim(),
        collectedAmount: amount,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Tahsilat kaydedildi")
      setCollectOpen(false)
      router.refresh()
    })
  }

  const STATUS_BADGE: Record<
    Campaign["status"],
    { label: string; className: string }
  > = {
    ACTIVE: { label: "Aktif", className: "bg-emerald-500" },
    ENDED: { label: "Tahsilat Bekleniyor", className: "bg-amber-500" },
    COLLECTED: { label: "Tahsil Edildi", className: "bg-slate-500" },
    CANCELLED: { label: "İptal", className: "bg-red-500" },
  }

  return (
    <div className="space-y-6">
      {/* Üst özet */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Durum</p>
              <Badge className={STATUS_BADGE[campaign.status].className}>
                {STATUS_BADGE[campaign.status].label}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">İndirim Oranı</p>
              <p className="text-lg font-bold tabular-nums">
                %{campaign.discountRate.toFixed(2).replace(".", ",")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tarih Aralığı</p>
              <p className="text-sm font-medium">
                {new Date(campaign.startDate).toLocaleDateString("tr-TR")}
                <span className="mx-1">→</span>
                {new Date(campaign.endDate).toLocaleDateString("tr-TR")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Kapsam</p>
              <p className="text-sm font-medium">
                {campaign.type === "BRAND" ? campaign.brandName : `${products.length} ürün`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Satılan Adet</p>
              <p className="text-lg font-bold tabular-nums">{totalQty}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tahsilat (TL)</p>
              <p className="text-lg font-bold tabular-nums text-primary">
                {totalDiscount.toLocaleString("tr-TR", {
                  style: "currency",
                  currency: "TRY",
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
          </div>

          {campaign.collectionDueDate && (
            <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Tahsilat Deadline:{" "}
              <span className="font-medium">
                {new Date(campaign.collectionDueDate).toLocaleDateString("tr-TR")}
              </span>
            </div>
          )}

          {campaign.notes && (
            <div className="mt-3 pt-3 border-t text-xs">
              <span className="text-muted-foreground">Not: </span>
              {campaign.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fiyat döndürme uyarısı (kampanya bitti ama fiyatlar hâlâ kampanyalı olabilir) */}
      {campaign.status === "ENDED" && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Fiyatlar hâlâ kampanyalı olabilir!
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Kampanya bitti ama Dopigo&apos;daki fiyatlar henüz normale dönmemiş
                olabilir. &quot;Dopigo Aktarım → Kampanyalar&quot; sekmesinden
                &quot;Eski Fiyatlara Döndür&quot; Excel&apos;ini indirip
                Dopigo&apos;ya yükleyin.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aksiyon butonları (status'e göre) */}
      <div className="flex flex-wrap gap-2">
        {campaign.status === "ACTIVE" && (
          <>
            <Button onClick={handleEnd} disabled={pending} size="sm">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Kampanyayı Bitir
            </Button>
            <Button
              onClick={handleCancel}
              disabled={pending}
              variant="outline"
              size="sm"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              İptal Et
            </Button>
          </>
        )}
        {campaign.status === "ENDED" && (
          <Button
            onClick={() => {
              setCollectedAmount(totalDiscount.toFixed(2))
              setCollectOpen(true)
            }}
            disabled={pending}
            size="sm"
          >
            <Receipt className="h-4 w-4 mr-1.5" />
            Tahsilat Yap
          </Button>
        )}

        {/* Admin-only kalıcı silme butonu — COLLECTED hariç her statüde gösterilir */}
        {isAdmin && campaign.status !== "COLLECTED" && (
          <Button
            onClick={handleDelete}
            disabled={pending}
            variant="destructive"
            size="sm"
            className="ml-auto"
            title="Bu kampanyayı tüm satış kayıtlarıyla birlikte kalıcı olarak sil"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Kalıcı Sil
          </Button>
        )}
      </div>

      {/* Tahsilat tamamlandıysa fatura bilgisi */}
      {campaign.status === "COLLECTED" && (
        <Card className="border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Tahsil edildi</p>
              <p className="text-xs text-muted-foreground">
                Fatura No: <span className="font-mono">{campaign.collectionInvoiceNo}</span>
                {" · "}
                Tutar:{" "}
                <span className="font-medium">
                  {campaign.collectedAmount?.toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                    maximumFractionDigits: 2,
                  })}
                </span>
                {campaign.collectedAt && (
                  <>
                    {" · "}
                    Tarih: {new Date(campaign.collectedAt).toLocaleDateString("tr-TR")}
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ürün bazlı satış raporu */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Ürün Bazlı Satış Raporu
            {campaign.sales.length > 0 && (
              <Badge variant="outline" className="ml-2 text-[10px]">
                {salesByProduct.length} ürün, {totalQty} adet
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {campaign.sales.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title="Henüz kampanya kapsamında satış yapılmadı"
              className="m-4 border-0 bg-transparent p-4 sm:p-6"
            />
          ) : (
            <Table className="text-[12px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-center">Adet</TableHead>
                  <TableHead className="text-right">Ort. PSF</TableHead>
                  <TableHead className="text-right">Birim İndirim</TableHead>
                  <TableHead className="text-right">Toplam Tahsilat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesByProduct.map((s) => (
                  <TableRow key={s.productId}>
                    <TableCell>
                      <div className="font-medium">{s.productName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {s.productBarcode}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums font-medium">
                      {s.totalQty}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.avgPsf.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {((s.avgPsf * campaign.discountRate) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {s.totalDiscount.toLocaleString("tr-TR", {
                        style: "currency",
                        currency: "TRY",
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell>TOPLAM</TableCell>
                  <TableCell className="text-center tabular-nums">{totalQty}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right tabular-nums text-primary">
                    {totalDiscount.toLocaleString("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Kapsam — ürün listesi (PSF · İndirim · Mevcut alış · Kampanyalı alış) */}
      {products.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Kapsamdaki Ürünler ({products.length})
              <Badge variant="outline" className="ml-2 text-[10px]">
                İndirim PSF üzerinden hesaplanır → alışa yansır
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-[12px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">PSF</TableHead>
                    <TableHead className="text-right">İndirim TL</TableHead>
                    <TableHead className="text-right">Mevcut Alış</TableHead>
                    <TableHead className="text-right">
                      Kampanyalı Alış
                    </TableHead>
                    <TableHead className="text-right text-pink-600 dark:text-pink-400">
                      Kazanç (TL/ad)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const discountTL =
                      p.psf != null ? (p.psf * campaign.discountRate) / 100 : null
                    const virtualPurchase =
                      p.mainPurchasePrice != null && discountTL != null
                        ? Math.max(0, p.mainPurchasePrice - discountTL)
                        : null
                    const clamped =
                      p.mainPurchasePrice != null &&
                      discountTL != null &&
                      p.mainPurchasePrice - discountTL < 0
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {p.primaryBarcode}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.psf != null ? p.psf.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-pink-600 dark:text-pink-400">
                          {discountTL != null ? `-${discountTL.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.mainPurchasePrice != null
                            ? p.mainPurchasePrice.toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {virtualPurchase != null ? (
                            <span
                              className={
                                clamped ? "text-amber-600" : "text-emerald-600 dark:text-emerald-400"
                              }
                            >
                              {virtualPurchase.toFixed(2)}
                              {clamped && (
                                <span className="ml-1 text-[10px] font-normal">
                                  (0&apos;a kırpıldı)
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-pink-600 dark:text-pink-400 font-medium">
                          {discountTL != null ? discountTL.toFixed(2) : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="px-4 py-3 text-[11px] text-muted-foreground border-t">
              <strong>Formül:</strong> İndirim TL = PSF × {campaign.discountRate}% ·
              Kampanyalı Alış = Mevcut Alış − İndirim TL · Bu fiyatla satış formülü
              tüm pazaryerlerinde otomatik uygulanır (BuyBox baskısı atlanır)
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tahsilat dialog */}
      <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tahsilat Yap</DialogTitle>
            <DialogDescription>
              Markaya kestiğiniz iskonto faturasının bilgilerini girin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Sistem hesabı özet */}
            <div className="rounded-md border bg-muted/50 p-3 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Sistem Hesabı</p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">{totalQty} adet × ort. indirim</span>
                <span className="text-lg font-bold tabular-nums text-primary">
                  {totalDiscount.toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                PSF × %{campaign.discountRate.toFixed(0)} × satılan adet toplamı
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice-no" className="text-sm">
                Fatura No
              </Label>
              <Input
                id="invoice-no"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="ISK-2026-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-sm">
                Fatura Tutarı (TL)
              </Label>
              <Input
                id="amount"
                type="number"
                step={0.01}
                value={collectedAmount}
                onChange={(e) => setCollectedAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sistem hesabıyla dolduruldu — fatura tutarı farklıysa düzenleyin
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleCollect} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Tahsilatı Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Separator className="opacity-0" />
    </div>
  )
}
