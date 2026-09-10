"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Trash2, Search, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import {
  applyBudgetAction,
  computeBudgetAction,
  loadCandidatesAction,
  lookupForBudgetAction,
} from "./actions"

/**
 * Bütçe Dağıtımı — 3 adım: bedelsiz ürünleri okut → bütçeyi gör → dağıt.
 * Sade tutuldu (kullanıcı isteği 2026-09-10).
 */

interface FreeRow {
  key: string
  productId: number
  name: string
  quantity: number
  buyboxPrice: number | null
  netPerUnit: number
}

interface Candidate {
  productId: number
  name: string
  brandName: string | null
  currentCost: number
  minSalePrice: number
  competitorPrice: number
  targetPrice: number
  priceGap: number
  monthlyUnits: number
  neededBudget: number
}

interface Gecmis {
  id: number
  totalBudget: number
  usedBudget: number
  note: string | null
  createdAt: string
  urunSayisi: number
  urunler: Array<{ name: string; perUnitDiscount: number; units: number }>
}

export function BudgetFlow({ gecmis }: { gecmis: Gecmis[] }) {
  const [rows, setRows] = useState<FreeRow[]>([])
  const [barcode, setBarcode] = useState("")
  const [looking, setLooking] = useState(false)
  const [budget, setBudget] = useState(0)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()

  async function addBarcode() {
    const code = barcode.trim()
    if (!code) return
    setLooking(true)
    try {
      const r = await lookupForBudgetAction(code)
      if (!r.found) {
        toast.error(r.error ?? "Ürün bulunamadı")
        return
      }
      setRows((p) => [
        ...p,
        { key: `${r.product.id}-${Date.now()}`, productId: r.product.id, name: r.product.name, quantity: 1, buyboxPrice: null, netPerUnit: 0 },
      ])
      setBarcode("")
    } finally {
      setLooking(false)
    }
  }

  async function hesapla() {
    if (rows.length === 0) return
    const res = await computeBudgetAction(rows.map((r) => ({ productId: r.productId, quantity: r.quantity })))
    if (!res.success) {
      toast.error(res.error)
      return
    }
    const byId = new Map(res.data.items.map((i) => [i.productId, i]))
    setRows((p) =>
      p.map((r) => {
        const c = byId.get(r.productId)
        return c ? { ...r, buyboxPrice: c.buyboxPrice, netPerUnit: c.netPerUnit } : r
      }),
    )
    setBudget(res.data.totalBudget)
    const cand = await loadCandidatesAction()
    if (cand.success) {
      setCandidates(cand.data)
      // Bütçeye sığanları otomatik seç (sıra zaten en çok kazandıran önce)
      const auto = new Set<number>()
      let kalan = res.data.totalBudget
      for (const c of cand.data) {
        if (c.neededBudget <= kalan) {
          auto.add(c.productId)
          kalan -= c.neededBudget
        }
      }
      setSelected(auto)
    }
  }

  const secilenToplam = (candidates ?? [])
    .filter((c) => selected.has(c.productId))
    .reduce((s, c) => s + c.neededBudget, 0)
  const asim = secilenToplam > budget

  function uygula() {
    startTransition(async () => {
      const res = await applyBudgetAction({
        freeItems: rows.map((r) => ({ productId: r.productId, quantity: r.quantity })),
        selectedProductIds: Array.from(selected),
        note: note.trim() || null,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const d = res.data!
      toast.success(`${d.applied.length} ürünün alış fiyatı düşürüldü — ${formatCurrency(d.usedBudget)} kullanıldı`)
      setRows([])
      setBudget(0)
      setCandidates(null)
      setSelected(new Set())
      setNote("")
    })
  }

  return (
    <div className="space-y-4">
      {/* 1. BEDELSİZ GELENLER */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Bedelsiz gelen ürünler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Barkod okut / yaz"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void addBarcode()
                }
              }}
              className="max-w-xs"
            />
            <Button variant="outline" onClick={() => void addBarcode()} disabled={looking}>
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ekle
            </Button>
          </div>

          {rows.length > 0 && (
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={r.key} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <Input
                    type="number"
                    min={1}
                    value={r.quantity}
                    onChange={(e) =>
                      setRows((p) => p.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))
                    }
                    className="h-8 w-16"
                  />
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {r.buyboxPrice ? `buybox ${formatCurrency(r.buyboxPrice)}` : "—"}
                  </span>
                  <span className="w-28 text-right text-xs font-medium tabular-nums">
                    {r.netPerUnit > 0 ? `net ${formatCurrency(r.netPerUnit * r.quantity)}` : ""}
                  </span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button onClick={() => void hesapla()} className="mt-2">
                <Search className="mr-2 h-4 w-4" /> Bütçeyi hesapla
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. BÜTÇE + DAĞITIM */}
      {budget > 0 && candidates && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>2. Dağıtım</span>
              <span className="text-sm font-normal text-muted-foreground">
                Bütçe: <strong className="text-foreground">{formatCurrency(budget)}</strong>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidates.length === 0 ? (
              <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                Maliyeti yüzünden sıkışan ürün yok — bütçeye ihtiyaç duyan ürün bulunamadı.
                Vitrini kaybettiğin ürünler varsa sorun fiyatın güncellenmemiş olması olabilir;
                Dopigo Aktarım yapman yeterli.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Aşağıdakiler <strong>%5 kârla bile rakibin altına inemeyen</strong> ürünler.
                  Sıra: en çok satış kazandıran önde. Bütçeye sığanlar otomatik seçildi.
                </p>
                <div className="max-h-80 space-y-1.5 overflow-y-auto">
                  {candidates.map((c) => {
                    const secili = selected.has(c.productId)
                    return (
                      <label
                        key={c.productId}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm transition-colors",
                          secili && "border-primary/40 bg-primary/5",
                        )}
                      >
                        <Checkbox
                          checked={secili}
                          onCheckedChange={() =>
                            setSelected((p) => {
                              const n = new Set(p)
                              if (n.has(c.productId)) n.delete(c.productId)
                              else n.add(c.productId)
                              return n
                            })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            min satışım {formatCurrency(c.minSalePrice)} · rakip {formatCurrency(c.competitorPrice)} ·{" "}
                            <span className="text-amber-600">açık {formatCurrency(c.priceGap)}</span> · ay {c.monthlyUnits} adet
                          </p>
                        </div>
                        <span className="shrink-0 text-right text-xs tabular-nums">
                          {formatCurrency(c.neededBudget)}
                        </span>
                      </label>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                  <span className="text-muted-foreground">
                    Seçili: {selected.size} ürün
                  </span>
                  <span className={cn("font-bold tabular-nums", asim ? "text-rose-600" : "text-emerald-600")}>
                    {formatCurrency(secilenToplam)} / {formatCurrency(budget)}
                  </span>
                </div>
                {asim && (
                  <p className="text-xs text-rose-600">Seçim bütçeyi aşıyor — bazı ürünlerin işaretini kaldır.</p>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Not (opsiyonel)</Label>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. Eylül L'Oréal bedelsiz partisi" />
                </div>

                <Button onClick={uygula} disabled={pending || selected.size === 0 || asim}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Check className="mr-2 h-4 w-4" /> Alış fiyatlarını düşür
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* GEÇMİŞ */}
      {gecmis.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Geçmiş dağıtımlar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {gecmis.map((b) => (
              <div key={b.id} className="rounded-md border p-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    #{b.id} · {formatDate(b.createdAt)}
                    {b.note && <span className="ml-2 font-normal text-muted-foreground">{b.note}</span>}
                  </span>
                  <Badge variant="secondary">
                    {formatCurrency(b.usedBudget)} / {formatCurrency(b.totalBudget)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.urunSayisi} ürün: {b.urunler.map((u) => `${u.name} (−${formatCurrency(u.perUnitDiscount)})`).join(" · ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
