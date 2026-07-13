"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Save, Trash2, Search, CheckCircle2, AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { saveManualPriceAction, deleteManualPriceAction } from "./actions"

interface ItemRow {
  key: string
  sku: string | null
  barcode: string | null
  name: string
  totalQty: number
  totalRevenue: number
  manualPrice: number | null
  manualPriceId: number | null
  notes: string | null
}

interface Props {
  items: ItemRow[]
  defaultFrom: string
  defaultTo: string
}

function formatTL(n: number, max = 2): string {
  return n.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: max,
  })
}

export function EksikAlisFlow({ items, defaultFrom, defaultTo }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "missing" | "filled">("all")
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  function applyDateRange() {
    const params = new URLSearchParams()
    params.set("from", from)
    params.set("to", to)
    router.push(`/finans/eksik-alis?${params.toString()}`)
  }

  function setDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }))
  }

  async function save(row: ItemRow) {
    const raw = drafts[row.key] ?? (row.manualPrice != null ? String(row.manualPrice) : "")
    const price = parseFloat(raw.replace(",", "."))
    if (isNaN(price) || price <= 0) {
      toast.error("Geçerli bir alış fiyatı gir")
      return
    }
    startTransition(async () => {
      const res = await saveManualPriceAction({
        sku: row.sku,
        barcode: row.barcode,
        name: row.name,
        purchasePrice: price,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(`${row.name.slice(0, 40)} → ${formatTL(price)} kaydedildi`)
      setDrafts((d) => {
        const n = { ...d }
        delete n[row.key]
        return n
      })
      router.refresh()
    })
  }

  async function del(row: ItemRow) {
    if (row.manualPriceId == null) return
    startTransition(async () => {
      const res = await deleteManualPriceAction(row.manualPriceId!)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Silindi")
      router.refresh()
    })
  }

  // Filtrele
  const filteredItems = items.filter((i) => {
    if (filter === "missing" && i.manualPrice != null) return false
    if (filter === "filled" && i.manualPrice == null) return false
    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase("tr")
      return (
        i.name.toLocaleLowerCase("tr").includes(q) ||
        (i.sku ?? "").toLocaleLowerCase("tr").includes(q) ||
        (i.barcode ?? "").includes(q)
      )
    }
    return true
  })

  // Toplamlar
  const totalUnits = items.reduce((s, i) => s + i.totalQty, 0)
  const totalRevenue = items.reduce((s, i) => s + i.totalRevenue, 0)
  const filled = items.filter((i) => i.manualPrice != null).length
  const missing = items.length - filled

  return (
    <>
      {/* Tarih + filtre */}
      <Card>
        <CardContent className="p-5 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tarih (başlangıç)</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tarih (bitiş)</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          <Button onClick={applyDateRange} disabled={pending} size="sm" className="h-9">
            Uygula
          </Button>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün / SKU / barkod ara..."
              className="pl-8 h-9"
            />
          </div>

          <div className="flex gap-1">
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="h-9"
            >
              Tümü ({items.length})
            </Button>
            <Button
              size="sm"
              variant={filter === "missing" ? "default" : "outline"}
              onClick={() => setFilter("missing")}
              className="h-9"
            >
              Eksik ({missing})
            </Button>
            <Button
              size="sm"
              variant={filter === "filled" ? "default" : "outline"}
              onClick={() => setFilter("filled")}
              className="h-9"
            >
              Girilen ({filled})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Özet */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex min-h-[92px] flex-col justify-center gap-1.5 p-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Ürün</p>
            <p className="text-2xl font-bold tabular-nums">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex min-h-[92px] flex-col justify-center gap-1.5 p-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Adet</p>
            <p className="text-2xl font-bold tabular-nums">{totalUnits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex min-h-[92px] flex-col justify-center gap-1.5 p-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Gelir</p>
            <p className="text-lg font-bold tabular-nums">{formatTL(totalRevenue, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex min-h-[92px] flex-col justify-center gap-1.5 p-5">
            <p className="text-[10px] uppercase tracking-wider text-amber-600">Eksik Giriş</p>
            <p className="text-2xl font-bold tabular-nums text-amber-600">{missing}</p>
          </CardContent>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
            <p className="text-sm font-medium">Bu periyotta eşleşmemiş satış yok</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tüm Dopigo satışları sistemdeki ürünlerle eşleşiyor — manuel alışa gerek yok.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-[12px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün Adı (Dopigo)</TableHead>
                    <TableHead>SKU / Barkod</TableHead>
                    <TableHead className="text-center">Adet</TableHead>
                    <TableHead className="text-right">Toplam Gelir</TableHead>
                    <TableHead className="text-center w-[140px]">Alış (TL)</TableHead>
                    <TableHead className="text-right">Maliyet</TableHead>
                    <TableHead className="text-right">Kâr</TableHead>
                    <TableHead className="w-24">Aksiyon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((row) => {
                    const draftValue =
                      drafts[row.key] ?? (row.manualPrice != null ? String(row.manualPrice) : "")
                    const draftPrice = parseFloat(draftValue.replace(",", "."))
                    const validPrice = !isNaN(draftPrice) && draftPrice > 0
                    const totalCost = validPrice ? draftPrice * row.totalQty : 0
                    const profit = row.totalRevenue - totalCost
                    const isSaved = row.manualPrice != null
                    const hasUnsavedChange = drafts[row.key] != null
                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="font-medium">{row.name}</div>
                          {isSaved && (
                            <Badge variant="outline" className="text-[9px] mt-0.5 text-emerald-600">
                              ✓ Kayıtlı
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">
                          {row.sku && <div>{row.sku}</div>}
                          {row.barcode && (
                            <div className="text-muted-foreground">{row.barcode}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-medium">
                          {row.totalQty}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTL(row.totalRevenue, 0)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={0.01}
                            value={draftValue}
                            onChange={(e) => setDraft(row.key, e.target.value)}
                            placeholder="0"
                            className="h-8 text-right tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {validPrice ? formatTL(totalCost, 0) : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${profit < 0 ? "text-red-600" : profit > 0 ? "text-emerald-600" : ""}`}
                        >
                          {validPrice ? formatTL(profit, 0) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant={hasUnsavedChange ? "default" : "outline"}
                              onClick={() => save(row)}
                              disabled={pending || !validPrice}
                              className="h-7 w-7"
                              title="Kaydet"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                            {isSaved && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => del(row)}
                                disabled={pending}
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                title="Sil"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
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

      <Card className="border-amber-200/40 bg-amber-50/30 dark:bg-amber-950/10">
        <CardContent className="p-5 text-xs space-y-1">
          <p className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Nasıl çalışır
          </p>
          <p className="text-muted-foreground">
            Bu sayfada gördüğün ürünler <strong>Dopigo'da satılmış</strong> ama sistemde Product
            kaydı olmadığı için <strong>kâr hesabına dahil edilmiyor</strong>. Alış girince:
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground mt-1">
            <li>Dopigo Siparişler ekranı + Gelir/Gider tablosu otomatik güncellenir</li>
            <li>SKU/barkod bazlı kaydedilir — aynı ürün gelecek ay tekrar satılırsa aynı alış geçerli olur</li>
            <li>Yanlış yazarsan çöp ikonuyla silersin</li>
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
