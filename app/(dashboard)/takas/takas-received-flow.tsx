"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { AlertTriangle, ArrowDownToLine, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  lookupBarcodeAction,
  submitReceivedBatchAction,
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
  quantityToStock: number
  unitPrice: number | null
  note: string
}

export function TakasReceivedFlow({ counterparties }: Props) {
  // Default: ilk PHARMACY tipi (Senaryo A genelde eczane ile)
  const defaultCp = counterparties.find((c) => c.type === "PHARMACY") ?? counterparties[0]
  const [counterpartyId, setCounterpartyId] = useState<string>(String(defaultCp?.id ?? ""))
  const [generalNote, setGeneralNote] = useState("")
  const [lines, setLines] = useState<LineState[]>([])

  const [barcodeInput, setBarcodeInput] = useState("")
  const [pendingProduct, setPendingProduct] = useState<ExchangeProductInfo | null>(null)
  const [pendingQty, setPendingQty] = useState(1)
  const [pendingToStock, setPendingToStock] = useState(0)
  const [pendingPrice, setPendingPrice] = useState<string>("")
  const [pendingNote, setPendingNote] = useState("")

  const [lookingUp, startLookup] = useTransition()
  const [submitting, startSubmit] = useTransition()

  const barcodeRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

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
        toast.error(result.blockReason ?? "Bu ürün takasa alınamaz")
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
      setPendingToStock(0)
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
    if (pendingToStock < 0 || pendingToStock > pendingQty) {
      toast.error("Stoğa girecek miktar 0 ile toplam arasında olmalı")
      return
    }
    const priceNum = pendingPrice ? Number(pendingPrice) : null
    if (pendingToStock > 0 && (priceNum == null || isNaN(priceNum) || priceNum <= 0)) {
      toast.error("Stoğa giren ürün için alış fiyatı girilmeli")
      return
    }

    const line: LineState = {
      tempId: `${pendingProduct.id}-${Date.now()}`,
      productId: pendingProduct.id,
      productName: pendingProduct.name,
      primaryBarcode: pendingProduct.primaryBarcode,
      brandName: pendingProduct.brandName,
      quantity: pendingQty,
      quantityToStock: pendingToStock,
      unitPrice: priceNum,
      note: pendingNote,
    }
    setLines((prev) => [...prev, line])
    setPendingProduct(null)
    setBarcodeInput("")
    setPendingQty(1)
    setPendingToStock(0)
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
      const result = await submitReceivedBatchAction({
        counterpartyId: Number(counterpartyId),
        generalNote: generalNote.trim() || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          quantityToStock: l.quantityToStock,
          unitPrice: l.unitPrice,
          note: l.note.trim() || null,
        })),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${result.data.lineCount} satır kaydedildi — ${result.data.totalToStock} stoğa, ` +
          `${result.data.totalQuantity - result.data.totalToStock} doğrudan satışa`
      )
      setLines([])
      setGeneralNote("")
      setBarcodeInput("")
      setPendingProduct(null)
      setTimeout(() => barcodeRef.current?.focus(), 50)
    })
  }

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0)
  const totalToStock = lines.reduce((s, l) => s + l.quantityToStock, 0)
  const passThrough = pendingQty - pendingToStock
  const needsPrice = pendingToStock > 0

  return (
    <div className="space-y-4">
      {/* A — Cari + Seans Notu */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4" />
            Takas Giriş (Senaryo A — eczaneden alındı)
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Birden fazla ürünü art arda listeye ekleyip tek seferde &quot;Hepsini Kaydet&quot; ile bitir.
            Eczane onaylayınca Bekleyenler&apos;den tamamla.
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
              <Label htmlFor="rec-general-note">Seans Notu (opsiyonel)</Label>
              <Input
                id="rec-general-note"
                placeholder="Bu girişler için ortak not"
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
            <Label htmlFor="barcode-input-received">Barkod</Label>
            <Input
              id="barcode-input-received"
              ref={barcodeRef}
              autoFocus
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
                <Badge variant="secondary">Mevcut stok: {pendingProduct.mainStock}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pending-qty-rec">Toplam aldığın</Label>
                  <Input
                    id="pending-qty-rec"
                    ref={qtyRef}
                    type="number"
                    min={1}
                    value={pendingQty}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value))
                      setPendingQty(v)
                      if (pendingToStock > v) setPendingToStock(v)
                    }}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pending-to-stock">Stoğa girecek</Label>
                  <Input
                    id="pending-to-stock"
                    type="number"
                    min={0}
                    max={pendingQty}
                    value={pendingToStock}
                    onChange={(e) =>
                      setPendingToStock(Math.max(0, Math.min(pendingQty, Number(e.target.value))))
                    }
                    className="tabular-nums"
                  />
                </div>
              </div>

              {needsPrice && (
                <div className="space-y-1.5">
                  <Label htmlFor="pending-price">Alış birim fiyat (stoğa girecekler için, KDV dahil) ₺</Label>
                  <Input
                    id="pending-price"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0.00"
                    value={pendingPrice}
                    onChange={(e) => setPendingPrice(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pending-note-rec">Satır notu (opsiyonel)</Label>
                <Input
                  id="pending-note-rec"
                  placeholder="Örn: satılan sipariş no"
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

              <div className="rounded-md bg-background/60 border text-xs p-2 flex items-center gap-2 flex-wrap">
                {passThrough > 0 && (
                  <span>
                    <span className="font-medium text-foreground">{passThrough}</span> doğrudan satışa
                  </span>
                )}
                {passThrough > 0 && pendingToStock > 0 && <span className="text-muted-foreground">·</span>}
                {pendingToStock > 0 && (
                  <span>
                    <span className="font-medium text-foreground">{pendingToStock}</span> stoğa
                    {pendingPrice && ` (₺${pendingPrice}/adet)`}
                  </span>
                )}
                {passThrough === 0 && pendingToStock === 0 && (
                  <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    En az bir tarafta miktar olmalı
                  </span>
                )}
              </div>

              <Button
                onClick={handleAddLine}
                size="sm"
                className="w-full"
                disabled={passThrough === 0 && pendingToStock === 0}
              >
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
            <CardTitle className="text-sm font-medium">Giriş Listesi</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right tabular-nums">Toplam</TableHead>
                    <TableHead className="text-right tabular-nums">Stoğa</TableHead>
                    <TableHead className="text-right tabular-nums">Satışa</TableHead>
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
                      <TableCell className="text-right tabular-nums">{line.quantityToStock}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.quantity - line.quantityToStock}
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
                      Toplam: {line.quantity} · Stoğa: {line.quantityToStock} · Satışa:{" "}
                      {line.quantity - line.quantityToStock}
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
                <span className="font-medium text-foreground">{totalQty}</span> toplam adet
              </span>
              <span className="tabular-nums">
                <span className="font-medium text-foreground">{totalToStock}</span> stoğa
              </span>
              <span className="tabular-nums">
                <span className="font-medium text-foreground">{totalQty - totalToStock}</span> doğrudan satışa
              </span>
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
