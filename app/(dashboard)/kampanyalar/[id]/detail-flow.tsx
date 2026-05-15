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
import { useConfirm } from "@/components/common/confirm-provider"
import {
  endCampaignAction,
  cancelCampaignAction,
  deleteCampaignAction,
  addCampaignPaymentAction,
  deleteCampaignPaymentAction,
  markCampaignCollectedAction,
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

interface Payment {
  id: number
  amount: number
  paymentDate: string
  invoiceNo: string | null
  notes: string | null
  createdAt: string
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
  payments: Payment[]
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
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })
  const [paymentInvoiceNo, setPaymentInvoiceNo] = useState("")
  const [paymentNotes, setPaymentNotes] = useState("")

  const totalPaid = useMemo(
    () => campaign.payments.reduce((s, p) => s + p.amount, 0),
    [campaign.payments],
  )

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

  async function handleEnd() {
    const ok = await confirm({
      title: "Kampanya bitirilecek",
      description: "Devam etmek istiyor musun?",
      confirmText: "Evet, bitir",
    })
    if (!ok) return
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

  async function handleDelete() {
    const ok = await confirm({
      title: `"${campaign.name}" silinecek`,
      description:
        "Kampanya ile birlikte tüm satış kayıtları ve ürün bağlantıları da silinir. Bu işlem GERİ ALINAMAZ.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
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

  async function handleCancel() {
    const ok = await confirm({
      title: "Kampanya iptal edilecek",
      description: "Bu işlem geri alınamaz. Devam etmek istiyor musun?",
      confirmText: "Evet, iptal et",
      variant: "destructive",
    })
    if (!ok) return
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

  function handleAddPayment() {
    const amount = parseFloat(paymentAmount.replace(",", "."))
    if (isNaN(amount) || amount <= 0) {
      toast.error("Geçerli bir tutar girin")
      return
    }
    if (!paymentDate) {
      toast.error("Tahsilat tarihi zorunlu")
      return
    }
    startTransition(async () => {
      const result = await addCampaignPaymentAction({
        campaignId: campaign.id,
        amount,
        paymentDate,
        invoiceNo: paymentInvoiceNo.trim() || null,
        notes: paymentNotes.trim() || null,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const { remaining } = result.data
      toast.success(
        remaining > 0
          ? `Tahsilat eklendi — kalan ${remaining.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })}`
          : "Tahsilat tamamlandı",
      )
      setPaymentOpen(false)
      setPaymentAmount("")
      setPaymentInvoiceNo("")
      setPaymentNotes("")
      router.refresh()
    })
  }

  async function handleDeletePayment(paymentId: number, amount: number) {
    const ok = await confirm({
      title: "Tahsilat kaydı silinecek",
      description: `${amount.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })} tutarındaki tahsilat silinsin mi?`,
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteCampaignPaymentAction(paymentId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Tahsilat silindi")
      router.refresh()
    })
  }

  async function handleMarkCollected() {
    const ok = await confirm({
      title: "Tahsilat tamamlandı olarak işaretlensin mi?",
      description: `Toplam tahsil edilen: ${totalPaid.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}. Kampanya 'Tahsil Edildi' statüsüne geçer.`,
      confirmText: "Tamamla",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await markCampaignCollectedAction(campaign.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Kampanya tahsilatı tamamlandı")
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
          <>
            <Button
              onClick={() => {
                // Kalan tutarı default ver
                const remaining = Math.max(0, totalDiscount - totalPaid)
                setPaymentAmount(remaining > 0 ? remaining.toFixed(2) : "")
                setPaymentOpen(true)
              }}
              disabled={pending}
              size="sm"
            >
              <Receipt className="h-4 w-4 mr-1.5" />
              Tahsilat Ekle
            </Button>
            {campaign.payments.length > 0 && (
              <Button
                onClick={handleMarkCollected}
                disabled={pending}
                size="sm"
                variant="outline"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Tahsilatı Tamamla
              </Button>
            )}
          </>
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

      {/* Tahsilat Özeti + Liste (ENDED veya COLLECTED) */}
      {(campaign.status === "ENDED" || campaign.status === "COLLECTED") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Tahsilat
              {campaign.status === "COLLECTED" && (
                <Badge className="bg-emerald-500 text-[10px]">Tamamlandı</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Özet */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Beklenen</p>
                <p className="text-lg font-bold tabular-nums">
                  {totalDiscount.toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <div className="rounded-md border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Tahsil Edilen</p>
                <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {totalPaid.toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <div className={`rounded-md border p-3 ${Math.max(0, totalDiscount - totalPaid) > 0 ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50" : "bg-muted/30"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Kalan</p>
                <p className={`text-lg font-bold tabular-nums ${Math.max(0, totalDiscount - totalPaid) > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {Math.max(0, totalDiscount - totalPaid).toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
            </div>

            {/* Tahsilat listesi */}
            {campaign.payments.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Henüz tahsilat kaydı yok.
                {campaign.status === "ENDED" && " Yukarıdaki 'Tahsilat Ekle' butonundan ekle."}
              </div>
            ) : (
              <Table className="text-[12px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Fatura No</TableHead>
                    <TableHead>Not</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaign.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {new Date(p.paymentDate).toLocaleDateString("tr-TR")}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {p.invoiceNo ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {p.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {p.amount.toLocaleString("tr-TR", {
                          style: "currency",
                          currency: "TRY",
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        {campaign.status === "ENDED" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            disabled={pending}
                            onClick={() => handleDeletePayment(p.id, p.amount)}
                            title="Sil"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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

      {/* Yeni Tahsilat Ekle dialog (parçalı ödeme) */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tahsilat Ekle</DialogTitle>
            <DialogDescription>
              Markadan gelen ödemeyi tarihiyle birlikte kaydet. Parçalı tahsilat
              desteklenir — kalan tutarı daha sonra ekleyebilirsin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Özet */}
            <div className="rounded-md border bg-muted/50 p-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Beklenen</p>
                <p className="font-semibold tabular-nums">
                  {totalDiscount.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tahsil Edilen</p>
                <p className="font-semibold tabular-nums text-emerald-600">
                  {totalPaid.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Kalan</p>
                <p className="font-semibold tabular-nums text-amber-600">
                  {Math.max(0, totalDiscount - totalPaid).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount" className="text-sm">Tutar (TL) *</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  step={0.01}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="30000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-date" className="text-sm">Tahsilat Tarihi *</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-invoice" className="text-sm">Fatura No (opsiyonel)</Label>
              <Input
                id="payment-invoice"
                value={paymentInvoiceNo}
                onChange={(e) => setPaymentInvoiceNo(e.target.value)}
                placeholder="ISK-2026-001"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-notes" className="text-sm">Not (opsiyonel)</Label>
              <Input
                id="payment-notes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="havale, kısmi ödeme vs."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleAddPayment} disabled={pending}>
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
