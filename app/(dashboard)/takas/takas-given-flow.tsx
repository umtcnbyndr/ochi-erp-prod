"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { ArrowUpFromLine, AlertTriangle, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  lookupBarcodeAction,
  submitGivenBatchAction,
  type CounterpartyOption,
  type ExchangeProductInfo,
} from "./actions"

interface Props {
  counterparties: CounterpartyOption[]
}

interface LineState {
  tempId: string
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string | null
  quantity: number
  unitPrice: number | null
  note: string
  currentStock: number
  newStock: number
}

export function TakasGivenFlow({ counterparties }: Props) {
  const [counterpartyId, setCounterpartyId] = useState<string>(
    counterparties[0] ? String(counterparties[0].id) : ""
  )
  const [generalNote, setGeneralNote] = useState("")
  const [lines, setLines] = useState<LineState[]>([])

  const [barcodeInput, setBarcodeInput] = useState("")
  const [pendingProduct, setPendingProduct] = useState<ExchangeProductInfo | null>(null)
  const [pendingQty, setPendingQty] = useState(1)
  const [pendingPrice, setPendingPrice] = useState<string>("")
  const [pendingNote, setPendingNote] = useState("")

  const [lookingUp, startLookup] = useTransition()
  const [submitting, startSubmit] = useTransition()

  const barcodeRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const selectedCp = counterparties.find((c) => String(c.id) === counterpartyId)
  const isPharmacy = selectedCp?.type === "PHARMACY"
  const scenario = isPharmacy ? "B" : "C"

  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return
    e.preventDefault()
    const val = barcodeInput.trim()
    if (!val) return
    startLookup(async () => {
      const result = await lookupBarcodeAction(val)
      if (!result.found) {
        toast.error(`Barkod bulunamadı: ${val}`)
        setBarcodeInput("")
        return
      }
      if (result.blocked) {
        toast.error(result.blockReason ?? "Bu ürün takasa verilemez")
        setBarcodeInput("")
        return
      }
      if (!result.product) {
        toast.error("Ürün bilgisi alınamadı")
        setBarcodeInput("")
        return
      }
      setPendingProduct(result.product)
      setPendingQty(1)
      setPendingPrice("")
      setPendingNote("")
      setTimeout(() => qtyRef.current?.focus(), 50)
    })
  }

  function handleAddLine() {
    if (!pendingProduct) return
    if (pendingQty <= 0) {
      toast.error("Miktar sıfırdan büyük olmalı")
      return
    }
    const priceNum = pendingPrice ? Number(pendingPrice) : null
    if (pendingPrice && (priceNum == null || isNaN(priceNum) || priceNum < 0)) {
      toast.error("Geçersiz fiyat")
      return
    }

    // Daha önce eklenmiş satırlar da stoktan düşmüş sayılır — kümülatif hesap
    const alreadyFromSameProduct = lines
      .filter((l) => l.productId === pendingProduct.id)
      .reduce((s, l) => s + l.quantity, 0)
    const currentStock = pendingProduct.mainStock - alreadyFromSameProduct
    const newStock = currentStock - pendingQty

    const line: LineState = {
      tempId: `${pendingProduct.id}-${Date.now()}`,
      productId: pendingProduct.id,
      productName: pendingProduct.name,
      primaryBarcode: pendingProduct.primaryBarcode,
      brandName: pendingProduct.brandName,
      quantity: pendingQty,
      unitPrice: priceNum,
      note: pendingNote,
      currentStock,
      newStock,
    }
    setLines((prev) => [...prev, line])
    setPendingProduct(null)
    setBarcodeInput("")
    setPendingQty(1)
    setPendingPrice("")
    setPendingNote("")
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }

  function removeLine(tempId: string) {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId))
  }

  function handleSubmit() {
    if (lines.length === 0) return
    if (!counterpartyId) {
      toast.error("Cari seçmelisiniz")
      return
    }

    startSubmit(async () => {
      const result = await submitGivenBatchAction({
        counterpartyId: Number(counterpartyId),
        generalNote: generalNote.trim() || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          note: l.note.trim() || null,
        })),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${result.data.lineCount} satır, ${result.data.totalQuantity} adet takasa verildi`
      )
      setLines([])
      setGeneralNote("")
      setBarcodeInput("")
      setPendingProduct(null)
      setTimeout(() => barcodeRef.current?.focus(), 50)
    })
  }

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0)
  const negativeCount = lines.filter((l) => l.newStock < 0).length
  // Pending için de kümülatif stok hesapla
  const pendingAlreadyFromSame = pendingProduct
    ? lines
        .filter((l) => l.productId === pendingProduct.id)
        .reduce((s, l) => s + l.quantity, 0)
    : 0
  const pendingCurrentStock = pendingProduct ? pendingProduct.mainStock - pendingAlreadyFromSame : 0
  const stockWarning = pendingProduct && pendingQty > pendingCurrentStock

  return (
    <div className="space-y-4">
      {/* A — Cari + Seans Notu */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4" />
            Takas Çıkış ({scenario === "B" ? "Senaryo B — eczanede müşteriye verildi" : "Senaryo C — dış cariye verildi"})
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            {isPharmacy
              ? "Eczaneden müşteriye verdiğin, faturası sonradan kesilecek ürünler. Birden fazla ürünü listeye ekle, hepsini tek seferde kaydet."
              : "Dış carilerle karşılıklı ürün takası. Birden fazla ürünü listeye ekle, hepsini tek seferde kaydet."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cari</Label>
              <Select value={counterpartyId} onValueChange={setCounterpartyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Cari seçin" />
                </SelectTrigger>
                <SelectContent>
                  {counterparties.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.type === "PHARMACY" ? "Eczane" : c.type === "DISTRIBUTOR" ? "Distribütör" : "Birey"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="giv-general-note">Seans Notu (opsiyonel)</Label>
              <Input
                id="giv-general-note"
                placeholder={
                  isPharmacy
                    ? "Örn: müşteri adı, ne zaman fatura kesilecek"
                    : "Örn: ne zaman dönüş bekleniyor"
                }
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* B — Barkod Okut */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Barkod Okut</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="barcode-input-given">Barkod</Label>
            <Input
              id="barcode-input-given"
              ref={barcodeRef}
              placeholder="Barkodu okutun veya yazın, Enter'a basın"
              value={barcodeInput}
              onChange={(e) => {
                setBarcodeInput(e.target.value)
                if (pendingProduct) setPendingProduct(null)
              }}
              onKeyDown={handleBarcodeKeyDown}
              disabled={lookingUp || submitting}
              className="text-base"
            />
          </div>

          {pendingProduct && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{pendingProduct.name}</p>
                  {pendingProduct.brandName && (
                    <p className="text-xs text-muted-foreground">{pendingProduct.brandName}</p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  <Badge variant={pendingCurrentStock > 0 ? "secondary" : "destructive"}>
                    Stok: {pendingCurrentStock}
                  </Badge>
                  {pendingProduct.exchangeStock > 0 && (
                    <Badge variant="outline" className="text-amber-600 border-amber-500/30">
                      Takasta: {pendingProduct.exchangeStock}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pending-qty-giv">Miktar</Label>
                  <Input
                    id="pending-qty-giv"
                    ref={qtyRef}
                    type="number"
                    min={1}
                    value={pendingQty}
                    onChange={(e) => setPendingQty(Math.max(1, Number(e.target.value)))}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pending-price-giv">Birim fiyat ₺ (ops.)</Label>
                  <Input
                    id="pending-price-giv"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0.00"
                    value={pendingPrice}
                    onChange={(e) => setPendingPrice(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              {stockWarning && (
                <div className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs p-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Stok yeterli değil — {pendingCurrentStock} adet var, {pendingQty} istediniz. Takas sonrası stok{" "}
                  <span className="font-semibold tabular-nums">{pendingCurrentStock - pendingQty}</span> olur.
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pending-note-giv">Satır notu (opsiyonel)</Label>
                <Input
                  id="pending-note-giv"
                  placeholder="Örn: müşteri adı / notu"
                  value={pendingNote}
                  onChange={(e) => setPendingNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleAddLine()
                    }
                  }}
                />
              </div>

              <Button onClick={handleAddLine} size="sm" className="w-full">
                Listeye Ekle
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* C — Liste */}
      {lines.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Çıkış Listesi</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right tabular-nums">Miktar</TableHead>
                    <TableHead className="text-right tabular-nums">Stok</TableHead>
                    <TableHead className="text-right tabular-nums">₺/adet</TableHead>
                    <TableHead>Not</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.tempId}>
                      <TableCell>
                        <div className="font-medium">{line.productName}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {line.primaryBarcode}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {line.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        <span className="text-muted-foreground">{line.currentStock}</span>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span className={line.newStock < 0 ? "text-destructive font-semibold" : ""}>
                          {line.newStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.unitPrice != null ? `₺${line.unitPrice.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                        {line.note || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.tempId)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="sm:hidden divide-y">
              {lines.map((line) => (
                <div key={line.tempId} className="flex items-start justify-between gap-2 p-4">
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">{line.productName}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Miktar: {line.quantity} · Stok: {line.currentStock} →{" "}
                      <span className={line.newStock < 0 ? "text-destructive font-semibold" : ""}>
                        {line.newStock}
                      </span>
                      {line.unitPrice != null && ` · ₺${line.unitPrice.toFixed(2)}`}
                    </p>
                    {line.note && <p className="text-xs text-muted-foreground">{line.note}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(line.tempId)}
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular-nums">
                <span className="font-medium text-foreground">{lines.length}</span> satır
              </span>
              <span className="tabular-nums">
                <span className="font-medium text-foreground">{totalQty}</span> adet toplam
              </span>
              {negativeCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {negativeCount} üründe negatif stok oluşacak
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* D — Kaydet */}
      <Button
        onClick={handleSubmit}
        disabled={lines.length === 0 || submitting}
        className="w-full sm:w-auto"
        size="lg"
      >
        {submitting ? "Kaydediliyor…" : `Hepsini Kaydet (${lines.length} satır)`}
      </Button>
    </div>
  )
}
