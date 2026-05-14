"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  Receipt,
  TrendingDown,
  AlertTriangle,
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  Wallet,
  Clock,
  TableProperties,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useConfirm } from "@/components/common/confirm-provider"
import { formatDate } from "@/lib/utils"
import {
  createInvoiceAction,
  updateInvoiceAction,
  deleteInvoiceAction,
  addCollectionAction,
  removeCollectionAction,
  getLastDiscountPctAction,
  getInvoiceDetailAction,
  type SerializedInvoiceDetail,
} from "./actions"

// ===== Tipler =====

export interface InvoiceRow {
  id: number
  invoiceDate: string
  period: string
  invoiceNumber: string | null
  brandId: number | null
  brandName: string | null
  counterpartyId: number
  counterpartyName: string
  grossAmount: number
  discountPct: number
  discountAmount: number
  discountDueDate: string | null
  collectedAmount: number
  remainingDiscount: number
  discountStatus: "OPEN" | "PARTIAL" | "COLLECTED"
  note: string | null
  collectionCount: number
  lastCollectionDate: string | null
  lastCollectionAmount: number | null
  createdAt: string
}

interface PivotRowData {
  brandId: number | null
  brandName: string
  months: Record<number, { gross: number; discount: number }>
  totalGross: number
  totalDiscount: number
  totalCollected: number
  totalRemaining: number
}

interface Props {
  invoices: InvoiceRow[]
  stats: {
    pendingDiscount: number
    pendingCount: number
    thisMonthGross: number
    thisMonthCount: number
    yearGross: number
    yearCount: number
    yearDiscount: number
    overdueDiscount: number
    overdueCount: number
    dueSoonCount: number
    dueSoonAmount: number
  }
  brands: { id: number; name: string }[]
  counterparties: { id: number; name: string }[]
  pivotYear: number
  pivotRows: PivotRowData[]
  currentFilters: {
    brand: string
    counterpartyId: string
    year: string
    month: string
    status: "OPEN" | "PARTIAL" | "COLLECTED" | "ALL"
    search: string
  }
  canEdit: boolean
}

// ===== Helpers =====

function tl(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n) + " ₺"
}

/** Para input formatları — TR: "100.000,50" */
function formatMoneyDisplay(raw: string): string {
  if (!raw) return ""
  // Sadece rakam, nokta, virgül kalsın
  const cleaned = raw.replace(/[^\d.,]/g, "")
  // Virgülü ondalık ayırıcı kabul et — son virgülü tut, öncekiler noktaya çevrilebilir
  const lastComma = cleaned.lastIndexOf(",")
  let intPart = ""
  let decPart = ""
  if (lastComma >= 0) {
    intPart = cleaned.slice(0, lastComma).replace(/[.,]/g, "")
    decPart = cleaned.slice(lastComma + 1).replace(/[.,]/g, "").slice(0, 2)
  } else {
    intPart = cleaned.replace(/\./g, "")
  }
  // Binlik nokta ekle
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return decPart ? `${intFormatted},${decPart}` : intFormatted
}

/** "100.000,50" → 100000.50 */
function parseMoneyInput(formatted: string): number | null {
  if (!formatted) return null
  const cleaned = formatted.replace(/\./g, "").replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// ===== Vade quick options =====

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}
function endOfQuarter(date: Date): Date {
  const m = date.getUTCMonth() // 0-11
  const qEndMonth = m - (m % 3) + 2 // 2, 5, 8, 11
  return new Date(Date.UTC(date.getUTCFullYear(), qEndMonth + 1, 0))
}
function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31))
}
function toDateInput(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const MONTH_NAMES = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]

function periodLabel(period: string): string {
  const [y, m] = period.split("-")
  const monthIdx = Number(m) - 1
  return monthIdx >= 0 && monthIdx < 12 ? `${MONTH_NAMES[monthIdx]} ${y}` : period
}

const STATUS_META: Record<
  "OPEN" | "PARTIAL" | "COLLECTED",
  { label: string; className: string }
> = {
  OPEN: { label: "Beklemede", className: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200/40" },
  PARTIAL: { label: "Kısmen", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/40" },
  COLLECTED: { label: "Tahsil edildi", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/40" },
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const target = new Date(iso).getTime()
  const now = Date.now()
  return Math.floor((target - now) / (1000 * 60 * 60 * 24))
}

// ===== MoneyInput component =====

function MoneyInput({
  value,
  onChange,
  className,
  autoFocus,
  placeholder,
}: {
  value: string
  onChange: (formatted: string) => void
  className?: string
  autoFocus?: boolean
  placeholder?: string
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder ?? "0,00"}
      onChange={(e) => onChange(formatMoneyDisplay(e.target.value))}
      className={className}
    />
  )
}

// ===== Vade quick select =====

type DueOption = "year" | "quarter" | "month" | "custom"

function VadeSelector({
  value,
  onChange,
}: {
  value: string // YYYY-MM-DD or ""
  onChange: (date: string) => void
}) {
  const [mode, setMode] = useState<DueOption>(() => {
    if (!value) return "custom"
    // Initial mode: bakıp anla
    const today = new Date()
    if (value === toDateInput(endOfYear(today))) return "year"
    if (value === toDateInput(endOfQuarter(today))) return "quarter"
    if (value === toDateInput(endOfMonth(today))) return "month"
    return "custom"
  })

  function selectMode(m: DueOption) {
    setMode(m)
    const today = new Date()
    if (m === "year") onChange(toDateInput(endOfYear(today)))
    else if (m === "quarter") onChange(toDateInput(endOfQuarter(today)))
    else if (m === "month") onChange(toDateInput(endOfMonth(today)))
    // "custom" → değiştirme, kullanıcı manuel girer
  }

  return (
    <div className="space-y-1.5">
      <Select value={mode} onValueChange={(v) => selectMode(v as DueOption)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="year">Yıl Sonu (31 Aralık)</SelectItem>
          <SelectItem value="quarter">Bu Çeyrek Sonu</SelectItem>
          <SelectItem value="month">Bu Ay Sonu</SelectItem>
          <SelectItem value="custom">Diğer (manuel tarih)</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={value}
        onChange={(e) => {
          setMode("custom")
          onChange(e.target.value)
        }}
        className="h-8 text-xs"
        disabled={mode !== "custom" && !value}
      />
    </div>
  )
}

// ===== Main Flow =====

export function InvoiceFlow(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [showPivot, setShowPivot] = useState(false)

  const updateParam = (key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null || value === "" || value === "ALL") p.delete(key)
    else p.set(key, value)
    startTransition(() => router.push(`/finans/faturalar?${p.toString()}`))
  }

  const drawerInvoice = drawerId ? props.invoices.find((i) => i.id === drawerId) ?? null : null

  // Mevcut filtreyi koruyarak Excel export URL'i oluştur
  const excelExportUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (props.currentFilters.year !== "ALL") params.set("year", props.currentFilters.year)
    if (props.currentFilters.month !== "ALL") params.set("month", props.currentFilters.month)
    if (props.currentFilters.brand !== "ALL") params.set("brand", props.currentFilters.brand)
    if (props.currentFilters.counterpartyId !== "ALL")
      params.set("counterparty", props.currentFilters.counterpartyId)
    if (props.currentFilters.status !== "ALL") params.set("status", props.currentFilters.status)
    return `/api/finans-faturalar-export?${params.toString()}`
  }, [props.currentFilters])

  return (
    <div className="space-y-4">
      {/* KPI'lar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Bekleyen Alacak"
          value={tl(props.stats.pendingDiscount)}
          sub={`${props.stats.pendingCount} fatura tahsil edilmemiş`}
          icon={Wallet}
          bgAccent="bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400"
        />
        <KpiCard
          label="Bu Ay Bize Kesilen"
          value={tl(props.stats.thisMonthGross)}
          sub={`${props.stats.thisMonthCount} fatura · brüt`}
          icon={Receipt}
          bgAccent="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
        />
        <KpiCard
          label="Bu Yıl Bize Kesilen"
          value={tl(props.stats.yearGross)}
          sub={`${props.stats.yearCount} fatura · yıllık brüt`}
          icon={Receipt}
          bgAccent="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
        />
        <KpiCard
          label="Bu Yıl Toplam Alacak"
          value={tl(props.stats.yearDiscount)}
          sub="iskonto toplamı"
          icon={TrendingDown}
          bgAccent="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
        />
        <KpiCard
          label={props.stats.overdueCount > 0 ? "Vadesi Geçen" : "Yaklaşan Vade (7gün)"}
          value={
            props.stats.overdueCount > 0
              ? tl(props.stats.overdueDiscount)
              : tl(props.stats.dueSoonAmount)
          }
          sub={
            props.stats.overdueCount > 0
              ? `${props.stats.overdueCount} fatura · vadesi geçmiş!`
              : `${props.stats.dueSoonCount} fatura yaklaşıyor`
          }
          icon={props.stats.overdueCount > 0 ? AlertTriangle : Clock}
          bgAccent={
            props.stats.overdueCount > 0
              ? "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400"
              : "bg-muted text-muted-foreground"
          }
        />
      </div>

      {/* Filtre + ekle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="flex items-center gap-2 sm:flex-1 min-w-[180px]">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  defaultValue={props.currentFilters.search}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateParam("search", (e.target as HTMLInputElement).value || null)
                    }
                  }}
                  placeholder="Fatura no veya notta ara..."
                  className="pl-9 h-9 text-sm"
                />
                {props.currentFilters.search && (
                  <button
                    type="button"
                    onClick={() => updateParam("search", null)}
                    className="absolute right-2 top-2.5"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            <Select value={props.currentFilters.brand} onValueChange={(v) => updateParam("brand", v)}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 text-sm">
                <SelectValue placeholder="Marka" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm Markalar</SelectItem>
                <SelectItem value="MIXED">⊕ Karışık</SelectItem>
                {props.brands.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={props.currentFilters.counterpartyId} onValueChange={(v) => updateParam("counterparty", v)}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 text-sm">
                <SelectValue placeholder="Eczane" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm Eczaneler</SelectItem>
                {props.counterparties.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={props.currentFilters.year} onValueChange={(v) => updateParam("year", v)}>
              <SelectTrigger className="w-full sm:w-[110px] h-9 text-sm">
                <SelectValue placeholder="Yıl" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm Yıl</SelectItem>
                {[2026, 2027, 2028].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={props.currentFilters.month} onValueChange={(v) => updateParam("month", v)}>
              <SelectTrigger className="w-full sm:w-[110px] h-9 text-sm">
                <SelectValue placeholder="Ay" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm Ay</SelectItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>{MONTH_NAMES[m - 1]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={props.currentFilters.status} onValueChange={(v) => updateParam("status", v)}>
              <SelectTrigger className="w-full sm:w-[140px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm Durum</SelectItem>
                <SelectItem value="OPEN">Beklemede</SelectItem>
                <SelectItem value="PARTIAL">Kısmen</SelectItem>
                <SelectItem value="COLLECTED">Tahsil edildi</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" asChild className="gap-1.5">
                <a href={excelExportUrl} download>
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </a>
              </Button>
              <Button
                size="sm"
                variant={showPivot ? "default" : "outline"}
                onClick={() => setShowPivot((v) => !v)}
                className="gap-1.5"
              >
                <TableProperties className="h-4 w-4" />
                Aylık Özet
              </Button>
              {props.canEdit && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Yeni Fatura
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pivot tablo */}
      {showPivot && (
        <PivotTable year={props.pivotYear} rows={props.pivotRows} />
      )}

      {/* Liste */}
      {props.invoices.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
            Fatura bulunamadı. {props.canEdit && "Yeni fatura ekleyerek başla."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Tarih</th>
                  <th className="px-2 py-2.5 font-medium">Dönem</th>
                  <th className="px-2 py-2.5 font-medium">Marka</th>
                  <th className="px-2 py-2.5 font-medium">Eczane</th>
                  <th className="px-2 py-2.5 font-medium text-right">Bize Kesilen</th>
                  <th className="px-2 py-2.5 font-medium text-right">İsk %</th>
                  <th className="px-2 py-2.5 font-medium text-right">Alacak</th>
                  <th className="px-2 py-2.5 font-medium text-right">Tahsil</th>
                  <th className="px-2 py-2.5 font-medium text-right">Kalan</th>
                  <th className="px-2 py-2.5 font-medium">Vade</th>
                  <th className="px-4 py-2.5 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {props.invoices.map((inv) => {
                  const days = daysUntil(inv.discountDueDate)
                  const overdue = days !== null && days < 0 && inv.discountStatus !== "COLLECTED"
                  const dueSoon = days !== null && days >= 0 && days <= 7 && inv.discountStatus !== "COLLECTED"
                  return (
                    <tr
                      key={inv.id}
                      className="border-b cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => setDrawerId(inv.id)}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                        {formatDate(inv.invoiceDate)}
                        {inv.invoiceNumber && (
                          <div className="text-[10px] text-muted-foreground">#{inv.invoiceNumber}</div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-xs tabular-nums">{periodLabel(inv.period)}</td>
                      <td className="px-2 py-2.5">
                        {inv.brandName ? (
                          <span className="font-medium">{inv.brandName}</span>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">⊕ Karışık</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">{inv.counterpartyName}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{tl(inv.grossAmount)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                        %{inv.discountPct}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                        {tl(inv.discountAmount)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        <div>{tl(inv.collectedAmount)}</div>
                        {inv.lastCollectionDate && inv.collectionCount > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            son: {formatDate(inv.lastCollectionDate)}
                            {inv.collectionCount > 1 && ` (+${inv.collectionCount - 1})`}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {inv.remainingDiscount > 0 ? (
                          <span className="text-rose-700 dark:text-rose-400 font-medium">
                            {tl(inv.remainingDiscount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-xs whitespace-nowrap">
                        {inv.discountDueDate ? (
                          <span
                            className={
                              overdue
                                ? "text-rose-700 dark:text-rose-400 font-medium"
                                : dueSoon
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-muted-foreground"
                            }
                          >
                            {formatDate(inv.discountDueDate)}
                            {overdue && (
                              <div className="text-[10px]">{Math.abs(days!)} gün gecikme</div>
                            )}
                            {dueSoon && (
                              <div className="text-[10px]">{days} gün kaldı</div>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_META[inv.discountStatus].className}`}>
                          {STATUS_META[inv.discountStatus].label}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Detay drawer */}
      <Sheet open={drawerInvoice !== null} onOpenChange={(o) => !o && setDrawerId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {drawerInvoice && (
            <InvoiceDetailDrawer
              invoice={drawerInvoice}
              brands={props.brands}
              counterparties={props.counterparties}
              canEdit={props.canEdit}
              onClose={() => setDrawerId(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <CreateInvoiceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        brands={props.brands}
        counterparties={props.counterparties}
      />
    </div>
  )
}

// ===== Pivot Tablo =====

function PivotTable({ year, rows }: { year: number; rows: PivotRowData[] }) {
  // Toplam satırı hesapla
  const totals = useMemo(() => {
    const m: Record<number, { gross: number; discount: number }> = {}
    for (let i = 1; i <= 12; i++) m[i] = { gross: 0, discount: 0 }
    let totalGross = 0
    let totalDiscount = 0
    let totalCollected = 0
    let totalRemaining = 0
    for (const r of rows) {
      for (let i = 1; i <= 12; i++) {
        m[i].gross += r.months[i]?.gross ?? 0
        m[i].discount += r.months[i]?.discount ?? 0
      }
      totalGross += r.totalGross
      totalDiscount += r.totalDiscount
      totalCollected += r.totalCollected
      totalRemaining += r.totalRemaining
    }
    return { months: m, totalGross, totalDiscount, totalCollected, totalRemaining }
  }, [rows])

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b bg-muted/20 text-sm font-medium">
          {year} — Marka × Ay (Bize Kesilen / Alacak)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead className="border-b bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium sticky left-0 bg-muted/30 z-10">Marka</th>
                {MONTH_NAMES.map((m) => (
                  <th key={m} className="px-2 py-2 font-medium text-right tabular-nums">{m}</th>
                ))}
                <th className="px-3 py-2 font-medium text-right border-l">Toplam Brüt</th>
                <th className="px-3 py-2 font-medium text-right">Toplam Alacak</th>
                <th className="px-3 py-2 font-medium text-right">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-4 py-8 text-center text-muted-foreground">
                    {year} yılı için fatura bulunamadı
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((r) => (
                    <tr key={r.brandId ?? "MIXED"} className="border-b hover:bg-accent/20">
                      <td className="px-3 py-2 sticky left-0 bg-card z-10 font-medium">
                        {r.brandId === null ? (
                          <Badge variant="outline" className="text-[10px]">⊕ Karışık</Badge>
                        ) : (
                          r.brandName
                        )}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const data = r.months[m] ?? { gross: 0, discount: 0 }
                        return (
                          <td key={m} className="px-2 py-2 text-right tabular-nums">
                            {data.gross > 0 ? (
                              <>
                                <div className="text-foreground">{tl(data.gross)}</div>
                                <div className="text-[9px] text-emerald-700 dark:text-emerald-400">
                                  {tl(data.discount)}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right tabular-nums border-l font-semibold">{tl(r.totalGross)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                        {tl(r.totalDiscount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-700 dark:text-rose-400">
                        {tl(r.totalRemaining)}
                      </td>
                    </tr>
                  ))}
                  {/* Toplam */}
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-muted/40 z-10">TOPLAM</td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const data = totals.months[m] ?? { gross: 0, discount: 0 }
                      return (
                        <td key={m} className="px-2 py-2 text-right tabular-nums">
                          {data.gross > 0 ? (
                            <>
                              <div>{tl(data.gross)}</div>
                              <div className="text-[9px] text-emerald-700 dark:text-emerald-400 font-normal">
                                {tl(data.discount)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right tabular-nums border-l">{tl(totals.totalGross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {tl(totals.totalDiscount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">
                      {tl(totals.totalRemaining)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[10px] text-muted-foreground border-t bg-muted/10">
          Üst satır: bize kesilen brüt · Alt satır: iskonto alacağı
        </div>
      </CardContent>
    </Card>
  )
}

// ===== KPI Card =====

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  bgAccent,
}: {
  label: string
  value: string
  sub: string
  icon: React.ComponentType<{ className?: string }>
  bgAccent?: string
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bgAccent ?? "bg-muted"}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight tabular-nums leading-none mt-3">{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

// ===== Detay Drawer =====

function InvoiceDetailDrawer({
  invoice,
  brands,
  counterparties,
  canEdit,
  onClose,
}: {
  invoice: InvoiceRow
  brands: { id: number; name: string }[]
  counterparties: { id: number; name: string }[]
  canEdit: boolean
  onClose: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [pending, startTransition] = useTransition()
  const [collectionsRefreshKey, setCollectionsRefreshKey] = useState(0)
  const confirmDialog = useConfirm()
  const router = useRouter()

  const [form, setForm] = useState({
    invoiceDate: invoice.invoiceDate.slice(0, 10),
    period: invoice.period,
    invoiceNumber: invoice.invoiceNumber ?? "",
    brandId: invoice.brandId === null ? "MIXED" : String(invoice.brandId),
    counterpartyId: String(invoice.counterpartyId),
    grossAmount: formatMoneyDisplay(invoice.grossAmount.toFixed(2).replace(".", ",")),
    discountPct: String(invoice.discountPct),
    discountDueDate: invoice.discountDueDate ? invoice.discountDueDate.slice(0, 10) : "",
    note: invoice.note ?? "",
  })

  async function saveEdit() {
    const gross = parseMoneyInput(form.grossAmount) ?? NaN
    const pct = Number(form.discountPct.replace(",", "."))
    if (!Number.isFinite(gross) || gross <= 0) {
      toast.error("Geçerli brüt tutar gir")
      return
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("İskonto 0-100 arası olmalı")
      return
    }
    startTransition(async () => {
      const res = await updateInvoiceAction(invoice.id, {
        invoiceDate: new Date(form.invoiceDate).toISOString(),
        period: form.period,
        invoiceNumber: form.invoiceNumber.trim() || null,
        brandId: form.brandId === "MIXED" ? null : Number(form.brandId),
        counterpartyId: Number(form.counterpartyId),
        grossAmount: gross,
        discountPct: pct,
        discountDueDate: form.discountDueDate ? new Date(form.discountDueDate).toISOString() : null,
        note: form.note.trim() || null,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Fatura güncellendi")
      setEditMode(false)
      router.refresh()
    })
  }

  async function deleteThis() {
    const ok = await confirmDialog({
      title: "Fatura silinsin mi?",
      description: `Bu fatura ve ${invoice.collectionCount} tahsilat kaydı kalıcı olarak silinecek. Geri alınamaz.`,
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteInvoiceAction(invoice.id)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Fatura silindi")
      onClose()
      router.refresh()
    })
  }

  const previewDiscount = useMemo(() => {
    const g = parseMoneyInput(form.grossAmount)
    const p = Number(form.discountPct.replace(",", "."))
    if (g === null || !Number.isFinite(p)) return null
    return Math.round(g * (p / 100) * 100) / 100
  }, [form.grossAmount, form.discountPct])

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Fatura Detayı
          <Badge variant="outline" className={`ml-2 ${STATUS_META[invoice.discountStatus].className}`}>
            {STATUS_META[invoice.discountStatus].label}
          </Badge>
        </SheetTitle>
        <SheetDescription>
          {invoice.brandName ?? "Karışık"} · {periodLabel(invoice.period)} · {invoice.counterpartyName}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">Fatura Bilgileri</span>
              {canEdit && !editMode && (
                <Button size="sm" variant="ghost" onClick={() => setEditMode(true)} className="h-7 gap-1.5 text-xs">
                  <Edit3 className="h-3 w-3" /> Düzenle
                </Button>
              )}
            </div>

            {editMode ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Fatura Tarihi</Label>
                    <Input
                      type="date"
                      value={form.invoiceDate}
                      onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Dönem (YYYY-MM)</Label>
                    <Input
                      value={form.period}
                      onChange={(e) => setForm({ ...form, period: e.target.value })}
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Fatura No</Label>
                  <Input
                    value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Marka</Label>
                    <Select value={form.brandId} onValueChange={(v) => setForm({ ...form, brandId: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MIXED">⊕ Karışık</SelectItem>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Eczane</Label>
                    <Select value={form.counterpartyId} onValueChange={(v) => setForm({ ...form, counterpartyId: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {counterparties.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Bize Kesilen (₺)</Label>
                    <MoneyInput
                      value={form.grossAmount}
                      onChange={(v) => setForm({ ...form, grossAmount: v })}
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">İskonto %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.discountPct}
                      onChange={(e) => setForm({ ...form, discountPct: e.target.value })}
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Alacak Vadesi</Label>
                  <VadeSelector
                    value={form.discountDueDate}
                    onChange={(date) => setForm({ ...form, discountDueDate: date })}
                  />
                </div>
                {previewDiscount !== null && (
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2 text-xs">
                    İskonto alacağı = <span className="font-bold tabular-nums">{tl(previewDiscount, 2)}</span>
                  </div>
                )}
                <div>
                  <Label className="text-[11px]">Not</Label>
                  <Textarea
                    rows={2}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    className="resize-none text-xs"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditMode(false)} disabled={pending}>
                    Vazgeç
                  </Button>
                  <Button size="sm" onClick={saveEdit} disabled={pending}>
                    {pending ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <Field label="Fatura Tarihi" value={formatDate(invoice.invoiceDate)} />
                <Field label="Dönem" value={periodLabel(invoice.period)} />
                <Field label="Fatura No" value={invoice.invoiceNumber ?? "—"} />
                <Field label="Marka" value={invoice.brandName ?? "⊕ Karışık"} />
                <Field label="Eczane" value={invoice.counterpartyName} />
                <Field label="Bize Kesilen" value={tl(invoice.grossAmount, 2)} />
                <Field label="İskonto" value={`%${invoice.discountPct}`} />
                <Field label="Alacak" value={tl(invoice.discountAmount, 2)} bold />
                <Field
                  label="Alacak Vadesi"
                  value={invoice.discountDueDate ? formatDate(invoice.discountDueDate) : "—"}
                />
                {invoice.note && (
                  <div className="col-span-2 mt-1 rounded-md bg-muted/30 p-2 text-xs italic">
                    {invoice.note}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tahsilat listesi */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Alacak Tahsilatları ({invoice.collectionCount})
              </span>
              <div className="text-right text-xs">
                <div>
                  Toplam Alacak:{" "}
                  <span className="font-semibold text-emerald-700 tabular-nums">{tl(invoice.discountAmount, 2)}</span>
                </div>
                <div>
                  Tahsil:{" "}
                  <span className="font-semibold tabular-nums">{tl(invoice.collectedAmount, 2)}</span>
                </div>
                {invoice.remainingDiscount > 0 && (
                  <div>
                    Kalan:{" "}
                    <span className="font-semibold text-rose-700 tabular-nums">{tl(invoice.remainingDiscount, 2)}</span>
                  </div>
                )}
              </div>
            </div>
            <CollectionsList
              invoiceId={invoice.id}
              canEdit={canEdit}
              refreshKey={collectionsRefreshKey}
              onChange={() => setCollectionsRefreshKey((k) => k + 1)}
            />
            {canEdit && invoice.remainingDiscount > 0 && (
              <>
                <FullCollectButton
                  invoiceId={invoice.id}
                  remainingAmount={invoice.remainingDiscount}
                  onSuccess={() => setCollectionsRefreshKey((k) => k + 1)}
                />
                <AddCollectionForm
                  invoiceId={invoice.id}
                  maxAmount={invoice.remainingDiscount}
                  onSuccess={() => setCollectionsRefreshKey((k) => k + 1)}
                />
              </>
            )}
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={deleteThis}
              disabled={pending}
              className="text-destructive hover:bg-destructive/10 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Faturayı sil (tahsilatlar dahil)
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

function Field({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={`tabular-nums ${bold ? "font-bold" : ""}`}>{value}</div>
    </div>
  )
}

// ===== Collections list + add =====

function CollectionsList({
  invoiceId,
  canEdit,
  refreshKey,
  onChange,
}: {
  invoiceId: number
  canEdit: boolean
  refreshKey: number
  onChange: () => void
}) {
  const [detail, setDetail] = useState<SerializedInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const confirmDialog = useConfirm()
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getInvoiceDetailAction(invoiceId).then((res) => {
      if (cancelled) return
      if (res.success) setDetail(res.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [invoiceId, refreshKey])

  async function remove(collectionId: number) {
    const ok = await confirmDialog({
      title: "Tahsilat silinsin mi?",
      description: "Bu işlem geri alınamaz. Durum yeniden hesaplanır.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeCollectionAction(collectionId)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Tahsilat silindi")
      onChange()
      router.refresh()
    })
  }

  if (loading) return <div className="text-xs text-muted-foreground italic">Yükleniyor...</div>
  if (!detail || detail.collections.length === 0) {
    return <div className="text-xs text-muted-foreground italic">Henüz tahsilat yapılmamış.</div>
  }
  return (
    <div className="space-y-1.5">
      {detail.collections.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold tabular-nums">{tl(p.amount, 2)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums">{formatDate(p.paymentDate)}</span>
              {p.invoiceNumber && (
                <Badge variant="outline" className="text-[9px] font-mono tabular-nums">
                  #{p.invoiceNumber}
                </Badge>
              )}
            </div>
            {p.note && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{p.note}</div>}
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => remove(p.id)}
              disabled={pending}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              aria-label="Tahsilatı sil"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

function FullCollectButton({
  invoiceId,
  remainingAmount,
  onSuccess,
}: {
  invoiceId: number
  remainingAmount: number
  onSuccess: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  function submit() {
    startTransition(async () => {
      const res = await addCollectionAction({
        invoiceId,
        paymentDate: new Date(date).toISOString(),
        amount: remainingAmount,
        invoiceNumber: invoiceNumber.trim() || null,
        note: "Tam tahsilat",
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(`${remainingAmount.toFixed(2)} ₺ tahsil edildi — fatura kapatıldı`)
      setOpen(false)
      setInvoiceNumber("")
      onSuccess()
      router.refresh()
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="default"
        onClick={() => setOpen(true)}
        className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700"
      >
        <CheckCircle2 className="h-4 w-4" />
        Kalanı tek seferde tahsil et ({tl(remainingAmount, 2)})
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tam Tahsilat</DialogTitle>
            <DialogDescription>
              Kalan <strong>{tl(remainingAmount, 2)}</strong> tek seferde tahsil edilecek ve fatura kapatılacak.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tahsilat Tarihi</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Karşı Kestiğimiz Fatura No (opsiyonel)</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="h-9 text-sm tabular-nums"
                placeholder="Fatura no"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button onClick={submit} disabled={pending} className="bg-emerald-600 hover:bg-emerald-700">
              {pending ? "Tahsil ediliyor..." : "Tahsil Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddCollectionForm({
  invoiceId,
  maxAmount,
  onSuccess,
}: {
  invoiceId: number
  maxAmount: number
  onSuccess: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(
    formatMoneyDisplay(maxAmount.toFixed(2).replace(".", ",")),
  )
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [note, setNote] = useState("")

  function submit() {
    const n = parseMoneyInput(amount) ?? NaN
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Geçerli tutar gir")
      return
    }
    if (n > maxAmount + 0.01) {
      toast.error(`Maks ${maxAmount.toFixed(2)} ₺ tahsil edilebilir`)
      return
    }
    startTransition(async () => {
      const res = await addCollectionAction({
        invoiceId,
        paymentDate: new Date(date).toISOString(),
        amount: n,
        invoiceNumber: invoiceNumber.trim() || null,
        note: note.trim() || null,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Tahsilat eklendi")
      const remaining = Math.max(0, maxAmount - n)
      setAmount(formatMoneyDisplay(remaining.toFixed(2).replace(".", ",")))
      setInvoiceNumber("")
      setNote("")
      onSuccess()
      router.refresh()
    })
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="text-xs font-medium">Yeni Tahsilat</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Tarih</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px]">Tutar (₺)</Label>
          <MoneyInput
            value={amount}
            onChange={setAmount}
            className="h-8 text-xs tabular-nums"
          />
        </div>
      </div>
      <div>
        <Label className="text-[11px]">Karşı Kestiğimiz Fatura No</Label>
        <Input
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          className="h-8 text-xs tabular-nums"
          placeholder="Fatura no (opsiyonel)"
        />
      </div>
      <div>
        <Label className="text-[11px]">Not (havale/kasa/mahsup...)</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8 text-xs"
          placeholder="Opsiyonel"
        />
      </div>
      <Button size="sm" onClick={submit} disabled={pending} className="w-full">
        {pending ? "Ekleniyor..." : "Tahsilat Ekle"}
      </Button>
    </div>
  )
}

// ===== Create Invoice Dialog =====

function CreateInvoiceDialog({
  open,
  onClose,
  brands,
  counterparties,
}: {
  open: boolean
  onClose: () => void
  brands: { id: number; name: string }[]
  counterparties: { id: number; name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const todayStr = new Date().toISOString().slice(0, 10)
  const currentMonth = todayStr.slice(0, 7)
  const yearEnd = `${todayStr.slice(0, 4)}-12-31` // default vade: yıl sonu

  const [form, setForm] = useState({
    invoiceDate: todayStr,
    period: currentMonth,
    invoiceNumber: "",
    brandId: "MIXED",
    counterpartyId: counterparties[0] ? String(counterparties[0].id) : "",
    grossAmount: "", // formatlı: "100.000" gibi
    discountPct: "0",
    discountDueDate: yearEnd,
    note: "",
  })

  async function onBrandChange(brandIdStr: string) {
    setForm((prev) => ({ ...prev, brandId: brandIdStr }))
    const brandId = brandIdStr === "MIXED" ? null : Number(brandIdStr)
    try {
      const res = await getLastDiscountPctAction(brandId)
      if (res.pct !== null) {
        setForm((prev) => ({ ...prev, discountPct: String(res.pct) }))
      }
    } catch {
      // sessiz
    }
  }

  const previewDiscount = useMemo(() => {
    const g = parseMoneyInput(form.grossAmount)
    const p = Number(form.discountPct.replace(",", "."))
    if (g === null || !Number.isFinite(p)) return null
    return Math.round(g * (p / 100) * 100) / 100
  }, [form.grossAmount, form.discountPct])

  function submit() {
    const gross = parseMoneyInput(form.grossAmount) ?? NaN
    const pct = Number(form.discountPct.replace(",", "."))
    if (!Number.isFinite(gross) || gross <= 0) {
      toast.error("Brüt tutar gir")
      return
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("İskonto 0-100 arası olmalı")
      return
    }
    if (!form.counterpartyId) {
      toast.error("Eczane seç")
      return
    }
    if (!/^\d{4}-\d{2}$/.test(form.period)) {
      toast.error("Dönem formatı YYYY-MM olmalı")
      return
    }

    startTransition(async () => {
      const res = await createInvoiceAction({
        invoiceDate: new Date(form.invoiceDate).toISOString(),
        period: form.period,
        invoiceNumber: form.invoiceNumber.trim() || null,
        brandId: form.brandId === "MIXED" ? null : Number(form.brandId),
        counterpartyId: Number(form.counterpartyId),
        grossAmount: gross,
        discountPct: pct,
        discountDueDate: form.discountDueDate ? new Date(form.discountDueDate).toISOString() : null,
        note: form.note.trim() || null,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Fatura kaydedildi")
      onClose()
      setForm({
        invoiceDate: todayStr,
        period: currentMonth,
        invoiceNumber: "",
        brandId: "MIXED",
        counterpartyId: counterparties[0] ? String(counterparties[0].id) : "",
        grossAmount: "",
        discountPct: "0",
        discountDueDate: yearEnd,
        note: "",
      })
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni Alış Faturası</DialogTitle>
          <DialogDescription>
            Aracı eczaneden gelen brüt fatura + markanın yıl sonu iskonto oranı (bizim alacağımız).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Fatura Tarihi</Label>
              <Input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px]">Dönem (YYYY-MM)</Label>
              <Input
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
                className="h-9 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">Fatura No (opsiyonel)</Label>
            <Input
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Marka</Label>
              <Select value={form.brandId} onValueChange={onBrandChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MIXED">⊕ Karışık</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Aracı Eczane</Label>
              <Select
                value={form.counterpartyId}
                onValueChange={(v) => setForm({ ...form, counterpartyId: v })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Eczane seç" /></SelectTrigger>
                <SelectContent>
                  {counterparties.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Bize Kesilen (₺)</Label>
              <MoneyInput
                value={form.grossAmount}
                onChange={(v) => setForm({ ...form, grossAmount: v })}
                className="h-9 text-sm tabular-nums"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[11px]">Yıl Sonu İskonto %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.discountPct}
                onChange={(e) => setForm({ ...form, discountPct: e.target.value })}
                className="h-9 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">Alacak Vadesi</Label>
            <VadeSelector
              value={form.discountDueDate}
              onChange={(date) => setForm({ ...form, discountDueDate: date })}
            />
          </div>

          {previewDiscount !== null && previewDiscount > 0 && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2.5 text-xs">
              <span className="text-muted-foreground">Bizim alacağımız (karşı kestiğimiz fatura):</span>{" "}
              <span className="font-bold tabular-nums text-base text-emerald-700 dark:text-emerald-400">
                {tl(previewDiscount, 2)}
              </span>
            </div>
          )}

          <div>
            <Label className="text-[11px]">Not (opsiyonel)</Label>
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
