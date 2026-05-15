"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2,
  Send,
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  RefreshCw,
  Search,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useConfirm } from "@/components/common/confirm-provider"
import { pushDopigoStockAction } from "./actions"

type AlertStatus = "CRITICAL" | "RISKY" | "MISSED" | "MINOR" | "OK" | "UNMATCHED"

interface Row {
  productId: number
  barcode: string
  name: string
  brandName: string
  mainStock: number
  streetStock: number
  systemStock: number
  systemSource: string
  dopigoStock: number | null
  dopigoAvailable: number | null
  diff: number
  status: AlertStatus
  pushValue: number
}

interface Props {
  rows: Row[]
  totals: Record<AlertStatus, number>
  generatedAt: string
  canEdit: boolean
}

const STATUS_META: Record<AlertStatus, { label: string; icon: typeof AlertCircle; color: string; bg: string; description: string }> = {
  CRITICAL: { label: "Kapatılmalı", icon: AlertOctagon, color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-500/40", description: "Sistemde stok 0 ama Dopigo'da var" },
  RISKY:    { label: "Azaltılmalı", icon: AlertTriangle, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-500/40", description: "Dopigo bizden fazla — overselling riski" },
  MISSED:   { label: "Arttırılmalı", icon: Info, color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-500/40", description: "Bizde daha çok — kaçırılan satış" },
  MINOR:    { label: "Küçük Sapma", icon: Info, color: "text-slate-700 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-900/30 border-slate-400/40", description: "1 stok farkı — pending sipariş gecikmesi olabilir" },
  OK:       { label: "Tutarlı", icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/40", description: "Sistem = Dopigo" },
  UNMATCHED:{ label: "Eşleşmedi", icon: AlertCircle, color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-500/40", description: "Dopigo'da bu barkodlu ürün yok" },
}

export function StockAlertsFlow({ rows, totals, generatedAt, canEdit }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filterStatus, setFilterStatus] = useState<AlertStatus | "ALL">("ALL")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    let list = rows
    if (filterStatus !== "ALL") list = list.filter((r) => r.status === filterStatus)
    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase("tr")
      list = list.filter(
        (r) =>
          r.barcode.includes(q) ||
          r.name.toLocaleLowerCase("tr").includes(q) ||
          r.brandName.toLocaleLowerCase("tr").includes(q),
      )
    }
    return list
  }, [rows, filterStatus, search])

  // Sadece UNMATCHED dışındakileri push edilebilir
  const pushableIds = useMemo(
    () => filtered.filter((r) => r.status !== "UNMATCHED").map((r) => r.productId),
    [filtered],
  )

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === pushableIds.length && pushableIds.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pushableIds))
    }
  }

  async function handlePushSelected() {
    const items = rows
      .filter((r) => selected.has(r.productId) && r.status !== "UNMATCHED")
      .map((r) => ({ foreignSku: r.barcode, stock: r.pushValue, productId: r.productId }))

    if (items.length === 0) {
      toast.error("Seçim yok")
      return
    }

    const ok = await confirm({
      title: `${items.length} ürünün stoğu Dopigo'ya gönderilecek`,
      description: `Push edilecek değerler sistem efektif stoğudur. Dopigo bekleyen siparişleri otomatik düşer. Devam edilsin mi?`,
      confirmText: "Evet, gönder",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await pushDopigoStockAction(items)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const { successful, failed, errors } = res.data
      if (failed === 0) {
        toast.success(`${successful} ürün başarılı`)
      } else {
        toast.warning(
          `${successful} başarılı, ${failed} hatalı — ${errors[0]?.message?.slice(0, 60) ?? ""}`,
        )
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  async function handlePushOne(r: Row) {
    const ok = await confirm({
      title: `"${r.name.slice(0, 50)}" için stok push`,
      description: `Dopigo'ya ${r.pushValue} stok değeri gönderilecek. Devam?`,
      confirmText: "Gönder",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await pushDopigoStockAction([
        { foreignSku: r.barcode, stock: r.pushValue, productId: r.productId },
      ])
      if (!res.success) {
        toast.error(res.error)
        return
      }
      if (res.data.failed === 0) toast.success("Push başarılı")
      else toast.error(res.data.errors[0]?.message ?? "Hata")
      router.refresh()
    })
  }

  const allSelected =
    pushableIds.length > 0 && selected.size === pushableIds.length

  return (
    <>
      {/* Üst özet — durum sayıları */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {(["CRITICAL", "RISKY", "MISSED", "MINOR", "UNMATCHED", "OK"] as AlertStatus[]).map((st) => {
          const meta = STATUS_META[st]
          const Icon = meta.icon
          const active = filterStatus === st
          return (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(active ? "ALL" : st)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-all ${active ? meta.bg + " ring-2 ring-offset-1" : "hover:bg-muted/40"}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] uppercase tracking-wider truncate ${meta.color}`}>{meta.label}</p>
                <p className="text-lg font-bold tabular-nums leading-none">{totals[st]}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtre çubuğu */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Barkod / ürün adı / marka ara..."
              className="pl-8 h-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as AlertStatus | "ALL")}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tümü ({rows.length})</SelectItem>
              <SelectItem value="CRITICAL">Kapatılmalı ({totals.CRITICAL})</SelectItem>
              <SelectItem value="RISKY">Azaltılmalı ({totals.RISKY})</SelectItem>
              <SelectItem value="MISSED">Arttırılmalı ({totals.MISSED})</SelectItem>
              <SelectItem value="MINOR">Küçük Sapma ({totals.MINOR})</SelectItem>
              <SelectItem value="UNMATCHED">Eşleşmedi ({totals.UNMATCHED})</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            disabled={pending}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            Yenile
          </Button>

          {canEdit && (
            <Button
              size="sm"
              onClick={handlePushSelected}
              disabled={selected.size === 0 || pending}
              className="h-9 gap-1.5 ml-auto"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {selected.size > 0 ? `${selected.size} ürünü Dopigo'ya gönder` : "Seçim yapın"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tablo */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Tüm ürünler tutarlı 🎉"
                : "Filtreye uyan ürün yok"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-[12px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      {canEdit && (
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleAll}
                          disabled={pending}
                        />
                      )}
                    </TableHead>
                    <TableHead>Barkod</TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-center">Ana</TableHead>
                    <TableHead className="text-center">Cadde</TableHead>
                    <TableHead className="text-center font-semibold">Sistem</TableHead>
                    <TableHead className="text-center">Dopigo Depo</TableHead>
                    <TableHead className="text-center">Dopigo Satılabilir</TableHead>
                    <TableHead className="text-center">Fark</TableHead>
                    <TableHead>Durum</TableHead>
                    {canEdit && <TableHead className="text-right">Aksiyon</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const meta = STATUS_META[r.status]
                    const Icon = meta.icon
                    const canPush = r.status !== "UNMATCHED"
                    return (
                      <TableRow key={r.productId}>
                        <TableCell>
                          {canEdit && canPush && (
                            <Checkbox
                              checked={selected.has(r.productId)}
                              onCheckedChange={() => toggle(r.productId)}
                              disabled={pending}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{r.barcode}</TableCell>
                        <TableCell>
                          <div className="font-medium max-w-[280px] truncate">{r.name}</div>
                          <div className="text-[10px] text-muted-foreground">{r.brandName}</div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{r.mainStock}</TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">
                          {r.streetStock}
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-bold">
                          {r.systemStock}
                          {r.systemSource === "PHARMACY_FALLBACK" && (
                            <div className="text-[9px] text-muted-foreground">cadde'den</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {r.dopigoStock ?? "—"}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">
                          {r.dopigoAvailable ?? "—"}
                        </TableCell>
                        <TableCell className={`text-center tabular-nums font-semibold ${r.diff < 0 ? "text-amber-600" : r.diff > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                          {r.diff > 0 ? `+${r.diff}` : r.diff}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 text-[10px] ${meta.color}`}>
                            <Icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            {canPush && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePushOne(r)}
                                disabled={pending}
                                className="h-7 gap-1 text-[11px]"
                              >
                                <Send className="h-3 w-3" />
                                Gönder
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-right">
        Son güncelleme: {new Date(generatedAt).toLocaleString("tr-TR")}
      </p>
    </>
  )
}
