"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Trash2, Check, Gift, Target, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/common/empty-state"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import {
  applyBudgetAction,
  computeBudgetAction,
  loadCandidatesAction,
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

/** Numaralı adım başlığı — sırayı ve nerede olduğunu görünür kılar. */
function StepHeader({
  no,
  title,
  hint,
  state,
}: {
  no: number
  title: string
  hint?: string
  state: "active" | "done" | "waiting"
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          state === "done" && "bg-emerald-600 text-white",
          state === "active" && "bg-primary text-primary-foreground",
          state === "waiting" && "bg-muted text-muted-foreground",
        )}
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" /> : no}
      </div>
      <div className="min-w-0">
        <p className={cn("font-medium leading-7", state === "waiting" && "text-muted-foreground")}>
          {title}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
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
  const [computing, setComputing] = useState(false)

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
      setBarcode("")
      // Liste değişti → önceki hesap geçersiz
      setBudget(0)
      setCandidates(null)
      setSelected(new Set())
    } finally {
      setLooking(false)
    }
  }

  async function hesapla() {
    if (rows.length === 0) return
    setComputing(true)
    try {
      const res = await computeBudgetAction(
        rows.map((r) => ({ productId: r.productId, quantity: r.quantity })),
      )
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
        // Otomatik seçim YOK — kullanıcı kararı 2026-09-10: bütçenin hangi ürünlere
        // gideceğine kullanıcı karar verir, sistem sadece adayları ve tutarları gösterir.
        setSelected(new Set())
      }
    } finally {
      setComputing(false)
    }
  }

  const secilenToplam = (candidates ?? [])
    .filter((c) => selected.has(c.productId))
    .reduce((s, c) => s + c.neededBudget, 0)
  const kalan = budget - secilenToplam
  const asim = kalan < -0.005

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
      toast.success(
        `${d.applied.length} ürünün alış fiyatı düşürüldü — ${formatCurrency(d.usedBudget)} kullanıldı`,
      )
      setRows([])
      setBudget(0)
      setCandidates(null)
      setSelected(new Set())
      setNote("")
    })
  }

  const adim1 = rows.length > 0 ? (budget > 0 ? "done" : "active") : "active"
  const adim2 = budget > 0 ? "active" : "waiting"

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* ───── SOL: akış ───── */}
      <div className="min-w-0 space-y-4">
        {/* ADIM 1 */}
        <Card>
          <CardContent className="space-y-4 pt-5">
            <StepHeader
              no={1}
              title="Bedelsiz gelen ürünleri okut"
              hint="Firmanın gönderdiği ürünler — bunların satış getirisi bütçeni oluşturur"
              state={adim1}
            />

            <div className="flex gap-2 pl-10">
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
                autoFocus
              />
              <Button variant="outline" onClick={() => void addBarcode()} disabled={looking}>
                {looking ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                Ekle
              </Button>
            </div>

            {rows.length === 0 ? (
              <div className="pl-10">
                <EmptyState
                  icon={Gift}
                  title="Henüz ürün eklenmedi"
                  description="Firmadan bedelsiz gelen ürünlerin barkodunu okut. Her ürünün Trendyol vitrin fiyatından komisyon, kargo ve stopaj düşülerek net getirisi hesaplanır."
                  className="py-8"
                />
              </div>
            ) : (
              <div className="space-y-3 pl-10">
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Barkod</TableHead>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="w-[80px] text-center">Adet</TableHead>
                        <TableHead className="w-[120px] text-right">Buybox Fiyatı</TableHead>
                        <TableHead className="w-[130px] text-right">Net Getiri</TableHead>
                        <TableHead className="w-[44px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => (
                        <TableRow key={r.key}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {r.barcode}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate font-medium">
                            {r.name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={1}
                              value={r.quantity}
                              onChange={(e) =>
                                setRows((p) =>
                                  p.map((x, j) =>
                                    j === i
                                      ? { ...x, quantity: Math.max(1, Number(e.target.value)) }
                                      : x,
                                  ),
                                )
                              }
                              className="mx-auto h-8 w-16 text-center"
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {r.buyboxPrice ? formatCurrency(r.buyboxPrice) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.netPerUnit > 0 ? (
                              <>
                                <span className="font-semibold tabular-nums text-emerald-600">
                                  {formatCurrency(r.netPerUnit * r.quantity)}
                                </span>
                                {r.quantity > 1 && (
                                  <span className="block text-[11px] text-muted-foreground">
                                    {formatCurrency(r.netPerUnit)} × {r.quantity}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    {budget > 0 && (
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={4} className="text-right font-medium">
                            Toplam bütçe
                          </TableCell>
                          <TableCell className="text-right text-base font-bold tabular-nums text-emerald-600">
                            {formatCurrency(budget)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>

                {budget === 0 && (
                  <Button onClick={() => void hesapla()} disabled={computing}>
                    {computing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Bütçeyi hesapla
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ADIM 2 */}
        <Card className={cn(adim2 === "waiting" && "opacity-60")}>
          <CardContent className="space-y-4 pt-5">
            <StepHeader
              no={2}
              title="Bütçeyi dağıt"
              hint="Bütçeyi vermek istediğin ürünleri sen seç — sistem sadece açığı ve gereken tutarı gösterir"
              state={adim2}
            />

            {adim2 === "waiting" ? (
              <p className="pl-10 text-sm text-muted-foreground">
                Önce bedelsiz ürünleri ekleyip bütçeyi hesapla.
              </p>
            ) : candidates && candidates.length === 0 ? (
              <div className="pl-10">
                <EmptyState
                  icon={Target}
                  title="Bütçeye ihtiyaç duyan ürün yok"
                  description="Maliyeti yüzünden sıkışan ürün bulunamadı. Vitrini kaybettiğin ürünler varsa sorun fiyatın Trendyol'a gönderilmemiş olması olabilir — Dopigo Aktarım yapmak yeterli."
                  className="py-8"
                />
              </div>
            ) : (
              <div className="space-y-2 pl-10">
                <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                  {(candidates ?? []).map((c) => {
                    const secili = selected.has(c.productId)
                    return (
                      <label
                        key={c.productId}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors",
                          secili ? "border-primary/40 bg-primary/5" : "bg-card hover:bg-muted/40",
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
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span>min satışım {formatCurrency(c.minSalePrice)}</span>
                            <span>·</span>
                            <span>rakip {formatCurrency(c.competitorPrice)}</span>
                            <span>·</span>
                            <span className="font-medium text-amber-600">
                              açık {formatCurrency(c.priceGap)}
                            </span>
                            <span>·</span>
                            <span>ayda {c.monthlyUnits} adet</span>
                          </p>
                        </div>
                        <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                          {formatCurrency(c.neededBudget)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GEÇMİŞ */}
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

      {/* ───── SAĞ: özet paneli ───── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Bütçe
            </div>

            <div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(budget)}</p>
              <p className="text-xs text-muted-foreground">
                {rows.length > 0
                  ? `${rows.length} bedelsiz üründen net getiri`
                  : "Ürün ekleyince hesaplanır"}
              </p>
            </div>

            {budget > 0 && (
              <>
                <div className="space-y-1.5 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Seçili</span>
                    <span className="tabular-nums">{selected.size} ürün</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kullanılan</span>
                    <span className="tabular-nums">{formatCurrency(secilenToplam)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Kalan</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        asim ? "text-rose-600" : "text-emerald-600",
                      )}
                    >
                      {formatCurrency(kalan)}
                    </span>
                  </div>
                </div>

                {asim && (
                  <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                    Seçim bütçeyi aşıyor — bazı ürünlerin işaretini kaldır.
                  </p>
                )}

                <div className="space-y-1 border-t pt-3">
                  <Label className="text-xs">Not (opsiyonel)</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ör. Eylül bedelsiz partisi"
                    className="h-8 text-xs"
                  />
                </div>

                <Button
                  onClick={uygula}
                  disabled={pending || selected.size === 0 || asim}
                  className="w-full"
                >
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Check className="mr-2 h-4 w-4" />
                  Alış fiyatlarını düşür
                </Button>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Seçili ürünlerin alış fiyatı kalıcı olarak düşer. Eski fiyat fiyat
                  geçmişinde saklanır.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
