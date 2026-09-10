"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, Plus, Trash2, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency, cn } from "@/lib/utils"
import { lookupBarcodeAction, settleExchangesAction } from "./actions"
import type { PendingExchange } from "./pending-list"

/**
 * Takas Kapatma penceresi — MALİYET denkliği (kullanıcı kararı 2026-09-10).
 *
 * Solda cariye verdiklerimiz (seçilir, adet kısılabilir), sağda gelen ürünler
 * (barkodla eklenir, alış fiyatı ELLE girilir). Altta iki toplamın farkı.
 * Fark bakiye olarak takip EDİLMEZ — nota yazılıp kapanır.
 */

interface ReceivedRow {
  key: string
  productId: number
  name: string
  quantity: number
  unitPrice: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  counterpartyId: number
  counterpartyName: string
  /** Bu cariye ait açık "verilen" kayıtlar */
  givenRows: PendingExchange[]
  onDone?: () => void
}

export function SettleDialog({
  open,
  onOpenChange,
  counterpartyId,
  counterpartyName,
  givenRows,
  onDone,
}: Props) {
  const [selected, setSelected] = useState<Map<number, number>>(new Map())
  const [received, setReceived] = useState<ReceivedRow[]>([])
  const [barcode, setBarcode] = useState("")
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()
  const [looking, setLooking] = useState(false)

  function toggle(row: PendingExchange) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, row.quantity) // varsayılan: tamamı
      return next
    })
  }

  function setQty(id: number, qty: number, max: number) {
    setSelected((prev) => {
      const next = new Map(prev)
      next.set(id, Math.max(1, Math.min(max, qty)))
      return next
    })
  }

  async function addByBarcode() {
    const code = barcode.trim()
    if (!code) return
    setLooking(true)
    try {
      const r = await lookupBarcodeAction(code)
      if (!r.found) {
        toast.error("Ürün bulunamadı")
        return
      }
      if (r.blocked) {
        toast.error(r.blockReason)
        return
      }
      setReceived((prev) => [
        ...prev,
        {
          key: `${r.product.id}-${Date.now()}`,
          productId: r.product.id,
          name: r.product.name,
          quantity: 1,
          unitPrice: "",
        },
      ])
      setBarcode("")
    } finally {
      setLooking(false)
    }
  }

  const givenCost = useMemo(() => {
    let sum = 0
    for (const row of givenRows) {
      const q = selected.get(row.id)
      if (q == null) continue
      sum += (row.unitCost ?? 0) * q
    }
    return sum
  }, [givenRows, selected])

  const receivedCost = useMemo(
    () =>
      received.reduce((s, r) => {
        const p = Number(r.unitPrice)
        return s + (Number.isFinite(p) ? p * r.quantity : 0)
      }, 0),
    [received],
  )

  const difference = givenCost - receivedCost

  // Maliyeti okunamayan seçili kalem var mı (kapatmayı engeller)
  const missingCost = givenRows.filter(
    (r) => selected.has(r.id) && (r.unitCost == null || r.unitCost <= 0),
  )
  const missingPrice = received.some(
    (r) => !r.unitPrice.trim() || !Number.isFinite(Number(r.unitPrice)) || Number(r.unitPrice) < 0,
  )
  const canSubmit =
    selected.size > 0 && missingCost.length === 0 && !missingPrice && !pending

  function submit() {
    startTransition(async () => {
      const res = await settleExchangesAction({
        counterpartyId,
        given: Array.from(selected.entries()).map(([exchangeId, settleQuantity]) => ({
          exchangeId,
          settleQuantity,
        })),
        received: received.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
          unitPrice: Number(r.unitPrice),
        })),
        note: note.trim() || null,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const d = res.data!
      toast.success(
        `Kapatıldı — ${d.closedExchangeIds.length} kalem` +
          (d.splitExchangeIds.length > 0 ? `, ${d.splitExchangeIds.length} kalem açık kaldı` : ""),
      )
      setSelected(new Map())
      setReceived([])
      setNote("")
      onOpenChange(false)
      onDone?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{counterpartyName} — Takas Kapatma</DialogTitle>
          <DialogDescription>
            Denklik <strong>alış maliyeti</strong> üzerinden kurulur; adetlerin eşit olması
            gerekmez. Fark bakiye olarak takip edilmez, nota yazılır.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {/* SOL — verdiklerimiz */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Verdiklerimiz ({givenRows.length})
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {givenRows.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">Açık kayıt yok.</p>
              )}
              {givenRows.map((row) => {
                const checked = selected.has(row.id)
                const qty = selected.get(row.id) ?? row.quantity
                const noCost = row.unitCost == null || row.unitCost <= 0
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "rounded-md border p-2 text-xs transition-colors",
                      checked && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(row)}
                        disabled={noCost}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{row.product.name}</p>
                        <p className="text-muted-foreground">
                          {noCost ? (
                            <span className="text-rose-600">alış fiyatı yok — önce gir</span>
                          ) : (
                            <>
                              {row.quantity} adet × {formatCurrency(row.unitCost!)}
                              {!row.costSealed && (
                                <span
                                  className="ml-1 text-amber-600"
                                  title="Verildiği tarihteki fiyat kaydedilmemiş — bugünkü maliyet kullanılıyor"
                                >
                                  ~
                                </span>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      {checked && row.quantity > 1 && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground">kapat</Label>
                          <Input
                            type="number"
                            min={1}
                            max={row.quantity}
                            value={qty}
                            onChange={(e) => setQty(row.id, Number(e.target.value), row.quantity)}
                            className="h-7 w-14 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* SAĞ — gelenler */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gelenler ({received.length})
            </p>
            <div className="flex gap-1.5">
              <Input
                placeholder="Barkod okut / yaz"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void addByBarcode()
                  }
                }}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void addByBarcode()}
                disabled={looking}
                className="h-8 shrink-0"
              >
                {looking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {received.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">
                  Karşılık gelen ürünleri barkodla ekle.
                </p>
              )}
              {received.map((r, i) => (
                <div key={r.key} className="rounded-md border p-2 text-xs">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setReceived((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={r.quantity}
                      onChange={(e) =>
                        setReceived((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x,
                          ),
                        )
                      }
                      className="h-7 w-16 text-xs"
                    />
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="alış fiyatı"
                      value={r.unitPrice}
                      onChange={(e) =>
                        setReceived((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)),
                        )
                      }
                      className="h-7 flex-1 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TOPLAMLAR */}
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Verilen</span>
            <span className="font-medium tabular-nums">{formatCurrency(givenCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gelen</span>
            <span className="font-medium tabular-nums">{formatCurrency(receivedCost)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5">
            <span className="font-medium">Fark</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                Math.abs(difference) < 0.01
                  ? "text-emerald-600"
                  : difference > 0
                    ? "text-amber-600"
                    : "text-sky-600",
              )}
            >
              {Math.abs(difference) < 0.01
                ? "tam denk"
                : `${difference > 0 ? "−" : "+"}${formatCurrency(Math.abs(difference))}`}
            </span>
          </div>
          {Math.abs(difference) >= 0.01 && (
            <p className="text-[11px] text-muted-foreground">
              {difference > 0
                ? "Verdiğimiz daha değerli — fark bizim lehimize açık kalıyor."
                : "Gelen daha değerli — fazlası bize kalıyor."}{" "}
              Bakiye takibi yapılmaz, fark nota yazılır.
            </p>
          )}
        </div>

        {missingCost.length > 0 && (
          <p className="text-xs text-rose-600">
            {missingCost.length} seçili kalemde alış fiyatı yok — kapatmadan önce ürün kartından gir.
          </p>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Not (opsiyonel)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="ör. Ergin ile konuşuldu, denk kabul edildi"
            className="text-xs"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
