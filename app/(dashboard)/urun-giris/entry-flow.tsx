"use client"

import React, { useState, useRef, useCallback, useTransition, useEffect } from "react"
import { toast } from "sonner"
import { Loader2, Trash2, ArrowRight, PackageOpen, Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/common/empty-state"

import { formatCurrency, formatDate, formatNumber } from "@/lib/utils"
import type { MatchCandidate } from "@/lib/services/product-match"
import {
  lookupBarcodeAction,
  searchByNameAction,
  linkBarcodeAction,
  submitEntryAction,
  getRecentPurchasePricesAction,
  type RecentPurchasePrice,
} from "./actions"

// ─── helpers ────────────────────────────────────────────────────────────────

const TURKISH_MONTHS = [
  "OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN",
  "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK",
]

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-")
  const idx = parseInt(month, 10) - 1
  return `${year} ${TURKISH_MONTHS[idx] ?? month}`
}

function nextMonths(count = 7): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return result
}

function tempId(): string {
  return Math.random().toString(36).slice(2)
}

// ─── types ───────────────────────────────────────────────────────────────────

interface LineState {
  tempId: string
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string | null
  quantity: number
  unitPrice: number | null
  expirationDate: string | null
  paoMonths: number | null
  note: string
  oldStock: number
  newStock: number
}

interface PendingProduct {
  id: number
  name: string
  primaryBarcode: string
  brandName: string | null
  mainStock: number
  mainPurchasePrice: number | null
  lastBrandInvoiceNumber: string | null
  // editable
  quantity: number
  unitPrice: string
  miadType: "SKT" | "PAO"
  expirationDate: string
  paoMonths: string
  note: string
}

interface Counterparty {
  id: number
  name: string
}

interface OrderContextItem {
  itemId: number
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  orderedQty: number
  receivedQty: number
  remainingQty: number
}

interface OrderContext {
  id: number
  brandNames: string
  pendingItems: OrderContextItem[]
}

interface Props {
  counterparties: Counterparty[]
  orderContext?: OrderContext | null
}

// ─── main component ──────────────────────────────────────────────────────────

export function EntryFlow({ counterparties, orderContext }: Props) {
  // seans state
  const [source, setSource] = useState<"PURCHASE" | "RETURN">("PURCHASE")
  const [counterpartyId, setCounterpartyId] = useState<number | null>(
    counterparties[0]?.id ?? null
  )
  const [brandInvoiceNumber, setBrandInvoiceNumber] = useState("")
  const [pharmacyInvoiceLabel, setPharmacyInvoiceLabel] = useState<string>("")
  const [pharmacyInvoicePending, setPharmacyInvoicePending] = useState<boolean>(true)
  const [pharmacyInvoiceExpectedMonth, setPharmacyInvoiceExpectedMonth] = useState<string>(currentYearMonth())
  const [generalNote, setGeneralNote] = useState<string>("")

  // lines
  const [lines, setLines] = useState<LineState[]>([])

  // barkod input
  const [barcodeInput, setBarcodeInput] = useState<string>("")
  const barcodeRef = useRef<HTMLInputElement>(null)

  // pending product (okunan ama henüz eklenmemiş)
  const [pendingProduct, setPendingProduct] = useState<PendingProduct | null>(null)

  // son alış fiyatları (iade modunda)
  const [recentPrices, setRecentPrices] = useState<RecentPurchasePrice[]>([])

  // match modal
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [unknownBarcode, setUnknownBarcode] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [searchResults, setSearchResults] = useState<MatchCandidate[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // transitions
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [isLinking, startLinkTransition] = useTransition()

  // otomatik fatura ismi öner: cari değişince
  useEffect(() => {
    const cp = counterparties.find((c) => c.id === counterpartyId)
    if (cp) {
      const ym = formatMonthLabel(currentYearMonth())
      setPharmacyInvoiceLabel(`${ym} ${cp.name.toUpperCase()}`)
    }
  }, [counterpartyId, counterparties])

  // barkod input'u fokusla (pending yokken)
  const focusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }, [])

  // pending yokken barcode her zaman fokuslu kalsın
  useEffect(() => {
    if (!pendingProduct && !matchModalOpen) {
      focusBarcode()
    }
  }, [pendingProduct, matchModalOpen, focusBarcode])

  // ─── barkod arama ──────────────────────────────────────────────────────────

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = barcodeInput.trim()
    if (!val) return
    setBarcodeInput("")
    startTransition(async () => {
      const result = await lookupBarcodeAction(val)
      if (result.found && result.blocked) {
        toast.error(result.blockReason ?? "Bu ürün giriş yapılamaz")
        return
      }
      if (result.found && result.product) {
        const product = result.product

        // Sipariş bağlamında: siparişteki kalan adeti default yap, birim fiyat boş gelsin
        const orderItem = orderContext?.pendingItems.find(
          (oi) => oi.productId === product.id
        )

        const newPending: PendingProduct = {
          id: product.id,
          name: product.name,
          primaryBarcode: product.primaryBarcode,
          brandName: product.brand?.name ?? null,
          mainStock: product.mainStock,
          mainPurchasePrice: product.mainPurchasePrice,
          lastBrandInvoiceNumber: product.lastBrandInvoiceNumber,
          quantity: orderItem ? orderItem.remainingQty : 1,
          unitPrice: orderContext
            ? "" // sipariş bağlamında birim fiyat boş — kullanıcı girecek
            : product.mainPurchasePrice != null
            ? String(product.mainPurchasePrice)
            : "",
          miadType: "SKT",
          expirationDate: "",
          paoMonths: "",
          note: orderItem
            ? `Sipariş #${orderContext!.id} — ${orderItem.remainingQty} adet kalan`
            : "",
        }
        setPendingProduct(newPending)
        setRecentPrices([])
        if (source === "RETURN") {
          const prices = await getRecentPurchasePricesAction(product.id)
          setRecentPrices(prices)
          if (prices.length > 0) {
            setPendingProduct((p) =>
              p ? { ...p, unitPrice: String(prices[0].price) } : p
            )
          }
        }
      } else {
        setUnknownBarcode(val)
        setSearchQuery("")
        setSearchResults([])
        setMatchModalOpen(true)
      }
    })
  }

  // ─── pending ürün ekleme ───────────────────────────────────────────────────

  function handleAddLine(e?: React.FormEvent) {
    e?.preventDefault()
    if (!pendingProduct) return
    const qty = pendingProduct.quantity
    if (qty <= 0) {
      toast.error("Miktar sıfırdan büyük olmalı")
      return
    }
    const oldStock = pendingProduct.mainStock
    const newStock = oldStock + qty

    const expirationDate =
      pendingProduct.miadType === "SKT" ? pendingProduct.expirationDate || null : null
    const paoMonths =
      pendingProduct.miadType === "PAO"
        ? Number(pendingProduct.paoMonths) || null
        : null

    setLines((prev) => [
      ...prev,
      {
        tempId: tempId(),
        productId: pendingProduct.id,
        productName: pendingProduct.name,
        primaryBarcode: pendingProduct.primaryBarcode,
        brandName: pendingProduct.brandName,
        quantity: qty,
        unitPrice: pendingProduct.unitPrice ? Number(pendingProduct.unitPrice) : null,
        expirationDate,
        paoMonths,
        note: pendingProduct.note,
        oldStock,
        newStock,
      },
    ])
    setPendingProduct(null)
    setRecentPrices([])
    focusBarcode()
  }

  // ─── modal arama ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!matchModalOpen) return
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(() => {
      setSearchLoading(true)
      searchByNameAction(searchQuery).then((res) => {
        setSearchResults(res)
        setSearchLoading(false)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, matchModalOpen])

  function handleLinkBarcode(productId: number) {
    startLinkTransition(async () => {
      const result = await linkBarcodeAction(productId, unknownBarcode)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const p = result.data!
      const newPending: PendingProduct = {
        id: p.id,
        name: p.name,
        primaryBarcode: p.primaryBarcode,
        brandName: p.brand?.name ?? null,
        mainStock: p.mainStock,
        mainPurchasePrice: p.mainPurchasePrice,
        lastBrandInvoiceNumber: p.lastBrandInvoiceNumber,
        quantity: 1,
        unitPrice: p.mainPurchasePrice != null ? String(p.mainPurchasePrice) : "",
        miadType: "SKT",
        expirationDate: "",
        paoMonths: "",
        note: "",
      }
      setPendingProduct(newPending)
      setRecentPrices([])
      if (source === "RETURN") {
        const prices = await getRecentPurchasePricesAction(p.id)
        setRecentPrices(prices)
        if (prices.length > 0) {
          setPendingProduct((prev) =>
            prev ? { ...prev, unitPrice: String(prices[0].price) } : prev
          )
        }
      }
      setMatchModalOpen(false)
      toast.success("Barkod ürüne bağlandı")
    })
  }

  // ─── seans tamamla ────────────────────────────────────────────────────────

  function handleSubmit() {
    if (lines.length === 0) return
    if (source === "PURCHASE" && !counterpartyId) return
    startSubmitTransition(async () => {
      const result = await submitEntryAction(
        {
          source,
          counterpartyId: source === "PURCHASE" ? counterpartyId : null,
          generalNote: generalNote || null,
          brandInvoiceNumber: source === "PURCHASE" ? brandInvoiceNumber || null : null,
          pharmacyInvoiceLabel: source === "PURCHASE" ? pharmacyInvoiceLabel || null : null,
          pharmacyInvoicePending: source === "PURCHASE" ? pharmacyInvoicePending : false,
          pharmacyInvoiceExpectedMonth: source === "PURCHASE" ? pharmacyInvoiceExpectedMonth : null,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            expirationDate: l.expirationDate,
            paoMonths: l.paoMonths,
            note: l.note || null,
          })),
        },
        orderContext?.id ?? null
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const r = result.data
      let msg = `${r.lineCount} ürün eklendi`
      if (r.priceChanged > 0) msg += `, ${r.priceChanged} üründe fiyat değişti`
      if (r.orderCompleted) msg += " — Sipariş tamamlandı!"
      toast.success(msg)
      setLines([])
      setPendingProduct(null)
      setRecentPrices([])
      focusBarcode()
    })
  }

  // ─── submit butonu durumu ─────────────────────────────────────────────────

  const submitDisabled =
    isSubmitting ||
    lines.length === 0 ||
    (source === "PURCHASE" && !counterpartyId)

  const submitLabel = isSubmitting
    ? "Kaydediliyor..."
    : lines.length === 0
    ? "Ürün eklenmedi"
    : source === "PURCHASE" && !counterpartyId
    ? "Seans bilgileri eksik"
    : `Girişi Tamamla (${lines.length} ürün)`

  // ─── totals ──────────────────────────────────────────────────────────────

  // ─── satır güncelleme (inline edit) ────────────────────────────────────────

  function updateLine(
    tid: string,
    updates: Partial<Pick<LineState, "quantity" | "unitPrice" | "note">>
  ) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.tempId !== tid) return line
        const updated = { ...line, ...updates }
        if (updates.quantity !== undefined) {
          updated.newStock = updated.oldStock + updates.quantity
        }
        return updated
      })
    )
  }

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0)
  const totalAmount = lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.quantity, 0)

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* A — Seans Başlığı */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seans Bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Kaynak */}
            <div className="space-y-1.5">
              <Label>Kaynak</Label>
              <Select value={source} onValueChange={(v) => setSource(v as "PURCHASE" | "RETURN")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASE">Satın Alma</SelectItem>
                  <SelectItem value="RETURN">İade</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {source === "RETURN" ? (
              /* İade modu bilgi mesajı */
              <div className="sm:col-span-2 lg:col-span-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                  İade modu — müşteriden gelen ürünler stoğa ekleniyor, fatura bilgisi yok.
                </p>
              </div>
            ) : (
              <>
                {/* Cari */}
                <div className="space-y-1.5">
                  <Label>Cari (Eczane)</Label>
                  <Select
                    value={counterpartyId != null ? String(counterpartyId) : ""}
                    onValueChange={(v) => setCounterpartyId(v ? Number(v) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Seçiniz —" />
                    </SelectTrigger>
                    <SelectContent>
                      {counterparties.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Marka Fatura No */}
                <div className="space-y-1.5">
                  <Label>Marka Fatura No</Label>
                  <Input
                    value={brandInvoiceNumber}
                    onChange={(e) => setBrandInvoiceNumber(e.target.value)}
                    placeholder="Fatura numarası..."
                  />
                </div>

                {/* Fatura geçici ismi */}
                <div className="space-y-1.5">
                  <Label>Eczane Fatura Geçici İsmi</Label>
                  <Input
                    value={pharmacyInvoiceLabel}
                    onChange={(e) => setPharmacyInvoiceLabel(e.target.value)}
                    placeholder="2026 NİSAN ECZANE ADI"
                  />
                </div>

                {/* Beklenen ay */}
                <div className="space-y-1.5">
                  <Label>Beklenen Ay</Label>
                  <Select
                    value={pharmacyInvoiceExpectedMonth}
                    onValueChange={setPharmacyInvoiceExpectedMonth}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {nextMonths(7).map((ym) => (
                        <SelectItem key={ym} value={ym}>
                          {formatMonthLabel(ym)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fatura bekleniyor */}
                <div className="flex items-start gap-2 pt-6">
                  <Checkbox
                    id="pending"
                    checked={pharmacyInvoicePending}
                    onCheckedChange={(v) => setPharmacyInvoicePending(Boolean(v))}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="pending" className="cursor-pointer">
                      Fatura bekleniyor
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      (Eczane ay sonu fatura kesecek — şimdilik geçici isim girin, sonradan gerçek no ile güncellenir)
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Genel not — her zaman görünür */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label>Genel Not (opsiyonel)</Label>
              <Textarea
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
                placeholder="Seans notu..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sipariş bağlamı — bekleyen ürünler */}
      {orderContext && orderContext.pendingItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageOpen className="h-4 w-4" />
              Bekleyen Ürünler — Sipariş #{orderContext.id}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-48 overflow-y-auto">
              <Table className="text-[12px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Barkod</TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Marka</TableHead>
                    <TableHead className="text-center">Sipariş</TableHead>
                    <TableHead className="text-center">Gelen</TableHead>
                    <TableHead className="text-center font-bold">Kalan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderContext.pendingItems.map((oi) => {
                    const alreadyAdded = lines.some((l) => l.productId === oi.productId)
                    return (
                      <TableRow
                        key={oi.itemId}
                        className={alreadyAdded ? "opacity-40" : "cursor-pointer hover:bg-muted/50"}
                        onClick={() => {
                          if (!alreadyAdded && !pendingProduct) {
                            setBarcodeInput(oi.primaryBarcode)
                            // Trigger lookup
                            barcodeRef.current?.focus()
                          }
                        }}
                      >
                        <TableCell className="font-mono text-[11px]">
                          {oi.primaryBarcode}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {oi.productName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {oi.brandName}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {oi.orderedQty}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {oi.receivedQty > 0 ? (
                            <span className="text-green-600">{oi.receivedQty}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-bold text-orange-600">
                          {oi.remainingQty}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* B — Barkod Girişi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Barkod Okut</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Barkod input */}
          <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
            <Input
              ref={barcodeRef}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Barkod okutun veya yazın, Enter'a basın..."
              className="text-lg font-mono"
              disabled={isPending}
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" disabled={isPending || !barcodeInput.trim()}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ara"}
            </Button>
          </form>

          {/* Pending ürün detayları */}
          {pendingProduct && (
            <form onSubmit={handleAddLine}>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                {/* Ürün başlık */}
                <div>
                  <p className="font-semibold text-base">{pendingProduct.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {pendingProduct.brandName && <span>{pendingProduct.brandName} · </span>}
                    <span className="font-mono">{pendingProduct.primaryBarcode}</span>
                    <span className="ml-2">· Stok: {formatNumber(pendingProduct.mainStock)}</span>
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Miktar */}
                  <div className="space-y-1.5">
                    <Label>Miktar</Label>
                    <Input
                      type="number"
                      min={1}
                      value={pendingProduct.quantity}
                      onChange={(e) =>
                        setPendingProduct((p) =>
                          p ? { ...p, quantity: Math.max(1, parseInt(e.target.value) || 1) } : p
                        )
                      }
                      autoFocus
                    />
                  </div>

                  {/* Alış fiyatı */}
                  <div className="space-y-1.5">
                    <Label>Alış Fiyatı (KDV Dahil)</Label>
                    {source === "RETURN" && recentPrices.length > 0 && (
                      <Select onValueChange={(v) => setPendingProduct((p) => p ? { ...p, unitPrice: v } : p)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Son alış fiyatlarından seç..." />
                        </SelectTrigger>
                        <SelectContent>
                          {recentPrices.map((rp, i) => (
                            <SelectItem key={i} value={String(rp.price)}>
                              {formatCurrency(rp.price)} — {formatDate(rp.changedAt)}{rp.reason ? ` · ${rp.reason}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={pendingProduct.unitPrice}
                      onChange={(e) =>
                        setPendingProduct((p) => p ? { ...p, unitPrice: e.target.value } : p)
                      }
                      placeholder="0.00"
                    />
                  </div>

                  {/* Miad toggle: SKT / PAO */}
                  <div className="space-y-1.5">
                    <Label>Miad (opsiyonel)</Label>
                    <div className="flex gap-3 mb-1.5">
                      <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`miadType-${pendingProduct.id}`}
                          value="SKT"
                          checked={pendingProduct.miadType === "SKT"}
                          onChange={() =>
                            setPendingProduct((p) => p ? { ...p, miadType: "SKT", paoMonths: "" } : p)
                          }
                        />
                        Son Kullanma Tarihi
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`miadType-${pendingProduct.id}`}
                          value="PAO"
                          checked={pendingProduct.miadType === "PAO"}
                          onChange={() =>
                            setPendingProduct((p) => p ? { ...p, miadType: "PAO", expirationDate: "" } : p)
                          }
                        />
                        Açıldıktan Sonra Aç
                      </label>
                    </div>
                    {pendingProduct.miadType === "SKT" ? (
                      <Input
                        type="date"
                        value={pendingProduct.expirationDate}
                        onChange={(e) =>
                          setPendingProduct((p) => p ? { ...p, expirationDate: e.target.value } : p)
                        }
                      />
                    ) : (
                      <Input
                        type="number"
                        min={1}
                        value={pendingProduct.paoMonths}
                        onChange={(e) =>
                          setPendingProduct((p) => p ? { ...p, paoMonths: e.target.value } : p)
                        }
                        placeholder="Ay sayısı..."
                      />
                    )}
                  </div>

                  {/* Satır notu */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Satır Notu (opsiyonel)</Label>
                    <Input
                      value={pendingProduct.note}
                      onChange={(e) =>
                        setPendingProduct((p) => p ? { ...p, note: e.target.value } : p)
                      }
                      placeholder="Bu kalem için not..."
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit">Listeye Ekle</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPendingProduct(null)
                      setRecentPrices([])
                      focusBarcode()
                    }}
                  >
                    İptal
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* D — Eklenen Satırlar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Eklenen Satırlar</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="Henüz ürün eklenmedi"
              description="Barkod okutun."
              className="border-0 bg-transparent p-6 sm:p-8"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün</TableHead>
                      <TableHead>Marka</TableHead>
                      <TableHead className="text-right">Miktar</TableHead>
                      <TableHead className="text-right">Alış</TableHead>
                      <TableHead>Miad</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Not</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.tempId}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{line.productName}</p>
                            <p className="text-xs text-muted-foreground font-mono">{line.primaryBarcode}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.brandName ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.tempId, {
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="h-7 w-16 text-right text-[12px] tabular-nums ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={line.unitPrice ?? ""}
                            onChange={(e) =>
                              updateLine(line.tempId, {
                                unitPrice: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            className="h-7 w-20 text-right text-[12px] tabular-nums ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {line.expirationDate
                            ? formatDate(line.expirationDate)
                            : line.paoMonths != null
                            ? `PAO ${line.paoMonths} ay`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-sm font-mono">
                            <span className="text-muted-foreground">{formatNumber(line.oldStock)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-semibold text-green-600 dark:text-green-400">
                              {formatNumber(line.newStock)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.note}
                            onChange={(e) =>
                              updateLine(line.tempId, { note: e.target.value })
                            }
                            className="h-7 w-28 text-[12px]"
                            placeholder="—"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setLines((prev) => prev.filter((l) => l.tempId !== line.tempId))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3 text-sm text-muted-foreground text-right">
                <span className="font-medium text-foreground">{lines.length} ürün</span>
                {" · "}
                <span>{formatNumber(totalQty)} adet</span>
                {totalAmount > 0 && (
                  <>
                    {" · "}
                    <span>{formatCurrency(totalAmount)}</span>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* E — Tamamla */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={submitDisabled}
          onClick={handleSubmit}
          className="min-w-[200px]"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>

      {/* C — Eşleştirme Modalı */}
      <Dialog open={matchModalOpen} onOpenChange={(open) => {
        if (!open) {
          setMatchModalOpen(false)
          focusBarcode()
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Barkod bulunamadı: {unknownBarcode}</DialogTitle>
            <DialogDescription>
              Bu ürün sistemde zaten var mı? İsimle arayın veya yeni ürün ekleyin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ürün adı veya eczane kodu..."
              autoFocus
            />

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {searchLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">Sonuç bulunamadı</p>
              )}

              {searchResults.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border p-3 gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.brandName && <span>{r.brandName} · </span>}
                      <span className="font-mono">{r.primaryBarcode}</span>
                      <span className="ml-2">· stok: {formatNumber(r.mainStock)}</span>
                      <span className="ml-2">· {r.barcodeCount} barkod</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={isLinking}
                    onClick={() => handleLinkBarcode(r.id)}
                  >
                    {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Bu ürün"}
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 flex items-center justify-between">
              <a
                href="/urunler/yeni"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Yeni ürün oluştur →
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMatchModalOpen(false)
                  focusBarcode()
                }}
              >
                İptal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
