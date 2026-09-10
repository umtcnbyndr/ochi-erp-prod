"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Trash2, Check, Gift, Target, Wallet, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/common/empty-state"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import {
  applyBudgetAction,
  computeBudgetAction,
  lookupCandidateAction,
  lookupForBudgetAction,
} from "./actions"

interface FreeRow {
  key: string
  productId: number
  barcode: string
  name: string
  quantity: number
  buyboxPrice: number | null
  netPerUnit: number
}

interface TargetRow {
  key: string
  productId: number
  barcode: string
  name: string
  buyboxPrice: number | null
  currentCost: number
  priceGap: number
  monthlyUnits: number
  hasGap: boolean
  ownsBuybox: boolean
  /** Kullanıcının bu ürüne ayırdığı tutar (metin — serbest düzenlenebilir) */
  amount: string
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

/** Barkod okutma satırı — iki tabloda da aynı. */
function BarcodeAdder({
  placeholder,
  onAdd,
  busy,
}: {
  placeholder: string
  onAdd: (code: string) => void | Promise<void>
  busy: boolean
}) {
  const [code, setCode] = useState("")
  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            const v = code.trim()
            if (v) {
              void onAdd(v)
              setCode("")
            }
          }
        }}
        className="h-9"
      />
      <Button
        variant="outline"
        size="sm"
        className="h-9 shrink-0"
        disabled={busy}
        onClick={() => {
          const v = code.trim()
          if (v) {
            void onAdd(v)
            setCode("")
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
    </div>
  )
}

export function BudgetFlow({ gecmis }: { gecmis: Gecmis[] }) {
  const [free, setFree] = useState<FreeRow[]>([])
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [budget, setBudget] = useState(0)
  const [busyFree, setBusyFree] = useState(false)
  const [busyTarget, setBusyTarget] = useState(false)
  const [computing, setComputing] = useState(false)
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()

  // ---- bedelsiz taraf ----
  async function addFree(code: string) {
    setBusyFree(true)
    try {
      const r = await lookupForBudgetAction(code)
      if (!r.found) {
        toast.error(r.error ?? "Ürün bulunamadı")
        return
      }
      setFree((p) => [
        ...p,
        {
          key: `${r.product.id}-${Date.now()}`,
          productId: r.product.id,
          barcode: r.product.barcode,
          name: r.product.name,
          quantity: 1,
          buyboxPrice: null,
          netPerUnit: 0,
        },
      ])
      setBudget(0) // liste değişti → yeniden hesaplanmalı
    } finally {
      setBusyFree(false)
    }
  }

  async function hesapla() {
    if (free.length === 0) return
    setComputing(true)
    try {
      const res = await computeBudgetAction(
        free.map((r) => ({ productId: r.productId, quantity: r.quantity })),
      )
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const byId = new Map(res.data.items.map((i) => [i.productId, i]))
      setFree((p) =>
        p.map((r) => {
          const c = byId.get(r.productId)
          return c ? { ...r, buyboxPrice: c.buyboxPrice, netPerUnit: c.netPerUnit } : r
        }),
      )
      setBudget(res.data.totalBudget)
    } finally {
      setComputing(false)
    }
  }

  // ---- dağıtım tarafı ----
  async function addTarget(code: string) {
    setBusyTarget(true)
    try {
      const r = await lookupCandidateAction(code)
      if (!r.found) {
        toast.error(r.error)
        return
      }
      const i = r.info
      if (targets.some((t) => t.productId === i.productId)) {
        toast.error("Bu ürün zaten listede")
        return
      }
      if (i.monthlyUnits <= 0) {
        toast.error(`"${i.name}" son 30 günde satmamış — bütçe verilemez`)
        return
      }
      setTargets((p) => [
        ...p,
        {
          key: `${i.productId}-${Date.now()}`,
          productId: i.productId,
          barcode: i.barcode,
          name: i.name,
          buyboxPrice: i.buyboxPrice,
          currentCost: i.currentCost,
          priceGap: i.priceGap,
          monthlyUnits: i.monthlyUnits,
          hasGap: i.hasGap,
          ownsBuybox: i.ownsBuybox,
          amount: i.suggestedAmount > 0 ? String(i.suggestedAmount) : "",
        },
      ])
    } finally {
      setBusyTarget(false)
    }
  }

  const kullanilan = targets.reduce((s, t) => {
    const n = Number(t.amount)
    return s + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
  const kalan = budget - kullanilan
  const asim = kalan < -0.005
  const gecerliSatir = targets.filter((t) => Number(t.amount) > 0).length

  function uygula() {
    startTransition(async () => {
      const res = await applyBudgetAction({
        freeItems: free.map((r) => ({ productId: r.productId, quantity: r.quantity })),
        allocations: targets
          .filter((t) => Number(t.amount) > 0)
          .map((t) => ({ productId: t.productId, amount: Number(t.amount) })),
        note: note.trim() || null,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const d = res.data!
      toast.success(
        `${d.applied.length} ürünün alış fiyatı düşürüldü — ${formatCurrency(d.usedBudget)} kullanıldı`,
      )
      setFree([])
      setTargets([])
      setBudget(0)
      setNote("")
    })
  }

  return (
    <div className="space-y-4">
      {/* ═══ BÜTÇE ŞERİDİ (en üstte) ═══ */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Wallet className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Bütçe</p>
                  <p className="text-xl font-bold leading-tight tabular-nums">
                    {formatCurrency(budget)}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Dağıtılan
                </p>
                <p className="text-xl font-bold leading-tight tabular-nums">
                  {formatCurrency(kullanilan)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Kalan</p>
                <p
                  className={cn(
                    "text-xl font-bold leading-tight tabular-nums",
                    asim ? "text-rose-600" : kalan > 0 ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  {formatCurrency(kalan)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Not (ör. Eylül bedelsiz partisi)"
                className="h-9 w-full md:w-56"
              />
              <Button
                onClick={uygula}
                disabled={pending || budget <= 0 || gecerliSatir === 0 || asim}
                className="h-9 shrink-0"
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Uygula
              </Button>
            </div>
          </div>

          {asim && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Dağıtılan tutar bütçeyi {formatCurrency(Math.abs(kalan))} aşıyor — tutarları düşür.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ═══ İKİ TABLO YAN YANA ═══ */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── SOL: bedelsiz gelenler ── */}
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">Bedelsiz Gelenler</p>
                {free.length > 0 && <Badge variant="secondary">{free.length}</Badge>}
              </div>
              {free.length > 0 && budget === 0 && (
                <Button size="sm" onClick={() => void hesapla()} disabled={computing}>
                  {computing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Bütçeyi hesapla
                </Button>
              )}
            </div>

            <BarcodeAdder placeholder="Barkod okut / yaz" onAdd={addFree} busy={busyFree} />

            {free.length === 0 ? (
              <EmptyState
                icon={Gift}
                title="Ürün ekle"
                description="Firmadan bedelsiz gelen ürünlerin barkodunu okut. Vitrin fiyatından komisyon, kargo ve stopaj düşülerek net getirisi bulunur."
                className="py-6"
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[118px]">Barkod</TableHead>
                      <TableHead>Ürün</TableHead>
                      <TableHead className="w-[70px] text-center">Adet</TableHead>
                      <TableHead className="w-[100px] text-right">Buybox</TableHead>
                      <TableHead className="w-[110px] text-right">Net Getiri</TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {free.map((r, i) => (
                      <TableRow key={r.key}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {r.barcode}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm font-medium">
                          {r.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={1}
                            value={r.quantity}
                            onChange={(e) => {
                              const q = Math.max(1, Number(e.target.value))
                              setFree((p) => p.map((x, j) => (j === i ? { ...x, quantity: q } : x)))
                              setBudget(0)
                            }}
                            className="mx-auto h-8 w-14 px-1 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {r.buyboxPrice ? formatCurrency(r.buyboxPrice) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.netPerUnit > 0 ? (
                            <span className="text-sm font-semibold tabular-nums text-emerald-600">
                              {formatCurrency(r.netPerUnit * r.quantity)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setFree((p) => p.filter((_, j) => j !== i))
                              setBudget(0)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SAĞ: bütçe verilecekler ── */}
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium">Bütçe Verilecekler</p>
              {targets.length > 0 && <Badge variant="secondary">{targets.length}</Badge>}
            </div>

            <BarcodeAdder placeholder="Barkod okut / yaz" onAdd={addTarget} busy={busyTarget} />

            {targets.length === 0 ? (
              <EmptyState
                icon={Target}
                title="Ürün ekle"
                description="Bütçeyi vermek istediğin ürünlerin barkodunu okut. Her ürünün rakibe göre açığı ve önerilen tutar gelir — tutarı istediğin gibi değiştirebilirsin."
                className="py-6"
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[118px]">Barkod</TableHead>
                      <TableHead>Ürün</TableHead>
                      <TableHead className="w-[100px] text-right">Buybox</TableHead>
                      <TableHead className="w-[90px] text-right">Açık</TableHead>
                      <TableHead className="w-[110px] text-right">Ayrılan</TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targets.map((t, i) => (
                      <TableRow key={t.key}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {t.barcode}
                        </TableCell>
                        <TableCell className="max-w-[180px] text-sm">
                          <p className="truncate font-medium">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            alış {formatCurrency(t.currentCost)} · ay {t.monthlyUnits} adet
                          </p>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {t.buyboxPrice ? formatCurrency(t.buyboxPrice) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {t.hasGap ? (
                            <span className="font-medium text-amber-600">
                              {formatCurrency(t.priceGap)}
                            </span>
                          ) : t.ownsBuybox ? (
                            <span className="text-[11px] text-emerald-600">vitrin bizde</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">açık yok</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={t.amount}
                            placeholder="0"
                            onChange={(e) =>
                              setTargets((p) =>
                                p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                              )
                            }
                            className="h-8 w-full px-2 text-right tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setTargets((p) => p.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {targets.some((t) => !t.hasGap) && (
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                Açığı olmayan ürünler var — bunların fiyatı zaten rakiple yarışabiliyor, bütçeye
                ihtiyaçları yok. Yine de vermek istersen tutarı elle yaz.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ GEÇMİŞ ═══ */}
      {gecmis.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium">Geçmiş dağıtımlar</p>
            {gecmis.map((b) => (
              <div key={b.id} className="rounded-lg border bg-card p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    #{b.id} · {formatDate(b.createdAt)}
                    {b.note && (
                      <span className="ml-2 font-normal text-muted-foreground">{b.note}</span>
                    )}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {formatCurrency(b.usedBudget)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.urunSayisi} ürün ·{" "}
                  {b.urunler
                    .map((u) => `${u.name} (−${formatCurrency(u.perUnitDiscount)})`)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
