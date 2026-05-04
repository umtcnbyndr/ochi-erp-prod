"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { lookupBarcodeAction, submitExitAction } from "./actions"

interface LineState {
  tempId: string
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string | null
  quantity: number
  note: string
  currentStock: number
  newStock: number
}

interface PendingProduct {
  id: number
  name: string
  primaryBarcode: string
  brandName: string | null
  mainStock: number
}

export function ExitFlow() {
  const [generalNote, setGeneralNote] = useState("")
  const [lines, setLines] = useState<LineState[]>([])
  const [barcodeInput, setBarcodeInput] = useState("")
  const [pendingProduct, setPendingProduct] = useState<PendingProduct | null>(null)
  const [pendingQty, setPendingQty] = useState(1)
  const [pendingNote, setPendingNote] = useState("")

  const [lookingUp, startLookup] = useTransition()
  const [submitting, startSubmit] = useTransition()

  const barcodeRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)

  // ── Barkod Enter → ürün bul → miktar'a geç ──
  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
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
          toast.error(result.blockReason ?? "Bu ürün çıkış yapılamaz")
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
        setPendingNote("")
        setTimeout(() => {
          qtyRef.current?.focus()
          qtyRef.current?.select()
        }, 50)
      })
    }
  }

  // ── Miktar Enter → listeye ekle → barkod'a geri dön ──
  function handleQtyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddLine()
    }
    // Tab → not alanına geç
  }

  // ── Not Enter → listeye ekle → barkod'a geri dön ──
  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddLine()
    }
  }

  function handleAddLine() {
    if (!pendingProduct) return
    const newStock = pendingProduct.mainStock - pendingQty
    const line: LineState = {
      tempId: `${pendingProduct.id}-${Date.now()}`,
      productId: pendingProduct.id,
      productName: pendingProduct.name,
      primaryBarcode: pendingProduct.primaryBarcode,
      brandName: pendingProduct.brandName,
      quantity: pendingQty,
      note: pendingNote,
      currentStock: pendingProduct.mainStock,
      newStock,
    }
    setLines((prev) => [...prev, line])
    setPendingProduct(null)
    setBarcodeInput("")
    setPendingQty(1)
    setPendingNote("")
    // Hemen barkod'a geri dön
    setTimeout(() => {
      barcodeRef.current?.focus()
    }, 30)
  }

  function removeLine(tempId: string) {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId))
  }

  function handleSubmit() {
    if (lines.length === 0) return
    startSubmit(async () => {
      const result = await submitExitAction({
        generalNote: generalNote.trim() || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          note: l.note.trim() || null,
        })),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const report = result.data
      toast.success(`${report.lineCount} ürün, ${report.totalQuantity} adet çıkış tamamlandı`)
      if (report.warnings.length > 0) {
        toast.warning(`${report.warnings.length} üründe stok yetmedi, negatif stok oluştu`)
      }
      setLines([])
      setGeneralNote("")
      setBarcodeInput("")
      setPendingProduct(null)
      setTimeout(() => barcodeRef.current?.focus(), 50)
    })
  }

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0)
  const negativeCount = lines.filter((l) => l.newStock < 0).length
  const stockWarning = pendingProduct && pendingQty > pendingProduct.mainStock

  return (
    <div className="space-y-4">
      {/* A — Seans notu (katlanabilir) */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Seans Notu (opsiyonel)
        </summary>
        <div className="mt-2">
          <Textarea
            placeholder="Bu çıkışlar için ortak not..."
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>
      </details>

      {/* B — Hızlı giriş satırı */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Satır 1: Barkod */}
          <div className="flex items-center gap-3">
            <Label htmlFor="barcode-input" className="shrink-0 text-sm font-medium w-16">
              Barkod
            </Label>
            <div className="relative flex-1">
              <Input
                id="barcode-input"
                ref={barcodeRef}
                autoFocus
                placeholder="Barkod okutun veya yazın, Enter'a basın..."
                value={barcodeInput}
                onChange={(e) => {
                  setBarcodeInput(e.target.value)
                  if (pendingProduct) setPendingProduct(null)
                }}
                onKeyDown={handleBarcodeKeyDown}
                disabled={lookingUp}
                className="text-base font-mono pr-10"
              />
              {lookingUp && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Satır 2: Ürün bilgisi + Miktar + Not (barkod okununca görünür) */}
          {pendingProduct && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
              {/* Ürün bilgisi */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{pendingProduct.name}</p>
                  {pendingProduct.brandName && (
                    <p className="text-xs text-muted-foreground">{pendingProduct.brandName}</p>
                  )}
                </div>
                <Badge
                  variant={pendingProduct.mainStock > 0 ? "secondary" : "destructive"}
                  className="shrink-0"
                >
                  Stok: {pendingProduct.mainStock}
                </Badge>
              </div>

              {/* Miktar + Not inline */}
              <div className="flex items-end gap-3">
                <div className="w-28 shrink-0">
                  <Label htmlFor="pending-qty" className="text-xs text-muted-foreground">
                    Miktar
                  </Label>
                  <Input
                    id="pending-qty"
                    ref={qtyRef}
                    type="number"
                    min={1}
                    value={pendingQty}
                    onChange={(e) => setPendingQty(Math.max(1, Number(e.target.value)))}
                    onKeyDown={handleQtyKeyDown}
                    className="tabular-nums text-center font-medium"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="pending-note" className="text-xs text-muted-foreground">
                    Not (opsiyonel — Tab ile geç)
                  </Label>
                  <Input
                    id="pending-note"
                    ref={noteRef}
                    placeholder="Satır notu..."
                    value={pendingNote}
                    onChange={(e) => setPendingNote(e.target.value)}
                    onKeyDown={handleNoteKeyDown}
                  />
                </div>
                <Button onClick={handleAddLine} size="sm" className="shrink-0">
                  Ekle
                </Button>
              </div>

              {/* Stok uyarısı */}
              {stockWarning && (
                <div className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs p-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Stok yeterli değil ({pendingProduct.mainStock}) — çıkış sonrası:{" "}
                  <span className="font-semibold tabular-nums">
                    {pendingProduct.mainStock - pendingQty}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Hızlı ipucu */}
          {!pendingProduct && !lookingUp && (
            <p className="text-[11px] text-muted-foreground/60">
              Barkod → Enter → Miktar → Enter → otomatik eklenir, barkoda döner
            </p>
          )}
        </CardContent>
      </Card>

      {/* C — Eklenen satırlar */}
      {lines.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium">
              Çıkış Listesi ({lines.length} ürün, {totalQty} adet)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop tablo */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead>Not</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.tempId}>
                      <TableCell>
                        <div className="font-medium text-sm">{line.productName}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {line.primaryBarcode}
                          {line.brandName && <span className="ml-2">· {line.brandName}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {line.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        <span className="text-muted-foreground">{line.currentStock}</span>
                        <span className="mx-1 text-muted-foreground/50">→</span>
                        <span className={line.newStock < 0 ? "text-destructive font-semibold" : ""}>
                          {line.newStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                        {line.note || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.tempId)}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobil kartlar */}
            <div className="sm:hidden divide-y">
              {lines.map((line) => (
                <div key={line.tempId} className="flex items-start justify-between gap-2 p-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium text-sm truncate">{line.productName}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      ×{line.quantity} · Stok: {line.currentStock} →{" "}
                      <span className={line.newStock < 0 ? "text-destructive font-semibold" : ""}>
                        {line.newStock}
                      </span>
                    </p>
                    {line.note && <p className="text-xs text-muted-foreground">{line.note}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(line.tempId)}
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Uyarı */}
            {negativeCount > 0 && (
              <div className="border-t px-4 py-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {negativeCount} üründe negatif stok oluşacak
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* D — Tamamla */}
      <Button
        onClick={handleSubmit}
        disabled={lines.length === 0 || submitting}
        className="w-full sm:w-auto"
        size="lg"
      >
        {submitting ? "Kaydediliyor…" : `Çıkışı Tamamla (${lines.length} ürün)`}
      </Button>
    </div>
  )
}
