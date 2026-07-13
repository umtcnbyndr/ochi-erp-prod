"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Wallet,
  Store,
  Edit3,
  Receipt,
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
import { useConfirm } from "@/components/common/confirm-provider"
import { formatDate } from "@/lib/utils"
import {
  createExpenseAction,
  updateExpenseAction,
  deleteExpenseAction,
  createEmployeeAction,
  saveMonthlySnapshotAction,
  deleteMonthlySnapshotAction,
  fetchDopigoMonthAction,
} from "./actions"
import type { ExpenseCategory, ExpensePeriodicity } from "@prisma/client"

const EMPLOYEE_CATEGORIES: string[] = ["SALARY", "BONUS", "MEAL", "INSURANCE"]

// ===== Tipler =====

interface ExpenseItem {
  id: number
  expenseDate: string
  period: string
  category: ExpenseCategory
  categoryLabel: string
  customCategory: string | null
  amount: number
  periodicity: ExpensePeriodicity
  periodicityLabel: string
  description: string | null
  vendor: string | null
  employeeId: number | null
  employeeName: string | null
  invoiceNumber: string | null
  note: string | null
  createdAt: string
}

interface EmployeeRow {
  id: number
  name: string
  position: string | null
  isActive: boolean
}

interface EmployeeBreakdownItem {
  employeeId: number | null
  employeeName: string
  months: Record<number, number>
  yearTotal: number
}

interface MonthlySalesRow {
  month: number
  revenue: number
  orders: number
  units: number
  cost: number
  commission: number
  shipping: number
  withholding: number
  other: number
  source: "MANUAL" | "DOPIGO_SNAPSHOT" | "DOPIGO_LIVE"
}

interface Props {
  year: number
  monthlyAgg: MonthlySalesRow[]
  expenseMatrix: {
    byCategory: Record<string, Record<number, number>>
    monthlyTotal: Record<number, number>
    categoryTotal: Record<string, number>
    grandTotal: number
    employeeBreakdown: Record<string, EmployeeBreakdownItem[]>
  }
  expenses: ExpenseItem[]
  employees: EmployeeRow[]
  categoryLabels: Record<string, string>
  yearTotals: {
    revenue: number
    cost: number
    commission: number
    shipping: number
    withholding: number
    other: number
    brutMarketplace: number
    operational: number
    totalExpense: number
    netProfit: number
    marginPct: number
  }
  canEdit: boolean
}

const MONTH_NAMES = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]

/** Ortak colgroup — tüm pivot tabloların kolonları aynı genişlikte hizalı kalsın
 *  Yatay scroll olmasın diye dar sütunlar + kompakt sayı formatı kullanılıyor */
function PivotColgroup() {
  return (
    <colgroup>
      <col className="w-[180px]" />
      {Array.from({ length: 12 }).map((_, i) => (
        <col key={i} />
      ))}
      <col className="w-[110px]" />
    </colgroup>
  )
}

// Kategori grupları — UI'da pivot tabloyu grupla
const GROUPS: { title: string; categories: ExpenseCategory[] }[] = [
  { title: "Personel", categories: ["SALARY", "BONUS", "MEAL", "INSURANCE"] },
  {
    title: "İşyeri",
    categories: ["RENT", "BUILDING_FEE", "ELECTRICITY", "GAS", "WATER", "INTERNET", "CLEANING"],
  },
  { title: "Paketleme", categories: ["BOX", "NYLON", "LABEL", "TAPE", "OFFICE"] },
  {
    title: "Yazılım/Servis",
    categories: ["SOFTWARE", "HOSTING", "DOMAIN", "DOPIGO", "INTEGRATION", "SMS", "CREDIT"],
  },
  { title: "Pazarlama", categories: ["ADVERTISING", "CONTENT"] },
  { title: "Mali", categories: ["ACCOUNTING", "TAX", "BANK_FEE"] },
  { title: "Diğer", categories: ["OTHER"] },
]

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "SALARY", label: "Maaş" },
  { value: "BONUS", label: "Prim" },
  { value: "MEAL", label: "Yemek" },
  { value: "INSURANCE", label: "Sigorta/SGK" },
  { value: "RENT", label: "Kira" },
  { value: "BUILDING_FEE", label: "Aidat" },
  { value: "ELECTRICITY", label: "Elektrik" },
  { value: "GAS", label: "Doğalgaz" },
  { value: "WATER", label: "Su" },
  { value: "INTERNET", label: "İnternet" },
  { value: "CLEANING", label: "Temizlik" },
  { value: "BOX", label: "Koli" },
  { value: "NYLON", label: "Naylon" },
  { value: "LABEL", label: "Etiket" },
  { value: "TAPE", label: "Bant" },
  { value: "OFFICE", label: "Ofis Malzeme" },
  { value: "SOFTWARE", label: "Yazılım" },
  { value: "HOSTING", label: "Hosting" },
  { value: "DOMAIN", label: "Domain" },
  { value: "DOPIGO", label: "Dopigo" },
  { value: "INTEGRATION", label: "Entegrasyon" },
  { value: "SMS", label: "SMS" },
  { value: "CREDIT", label: "Kontör" },
  { value: "ADVERTISING", label: "Reklam" },
  { value: "CONTENT", label: "İçerik" },
  { value: "ACCOUNTING", label: "Muhasebe" },
  { value: "TAX", label: "Vergi" },
  { value: "BANK_FEE", label: "Banka" },
  { value: "OTHER", label: "Diğer" },
]

const PERIODICITIES: { value: ExpensePeriodicity; label: string }[] = [
  { value: "ONE_TIME", label: "Tek Seferlik" },
  { value: "MONTHLY", label: "Aylık" },
  { value: "QUARTERLY", label: "3 Aylık" },
  { value: "YEARLY", label: "Yıllık" },
]

// ===== Helpers =====

function tl(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || n === 0) return "—"
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n) + " ₺"
}

function tlForced(n: number, decimals = 0): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n) + " ₺"
}

/** Kompakt format: 1.504.286 → 1,5M / 580.000 → 580K. Tam tutar tooltip'te. */
function tlCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "—"
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",")}M ₺`
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000).toLocaleString("tr-TR")}K ₺`
  }
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n) + " ₺"
}

function tlFull(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n) + " ₺"
}

function pct(n: number, decimals = 1): string {
  return `%${n.toFixed(decimals)}`
}

function formatMoneyDisplay(raw: string): string {
  if (!raw) return ""
  const cleaned = raw.replace(/[^\d.,]/g, "")
  const lastComma = cleaned.lastIndexOf(",")
  let intPart = ""
  let decPart = ""
  if (lastComma >= 0) {
    intPart = cleaned.slice(0, lastComma).replace(/[.,]/g, "")
    decPart = cleaned.slice(lastComma + 1).replace(/[.,]/g, "").slice(0, 2)
  } else {
    intPart = cleaned.replace(/\./g, "")
  }
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return decPart ? `${intFormatted},${decPart}` : intFormatted
}

function parseMoneyInput(formatted: string): number | null {
  if (!formatted) return null
  const cleaned = formatted.replace(/\./g, "").replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// ===== Main =====

export function GelirGiderFlow(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editMonthIdx, setEditMonthIdx] = useState<number | null>(null) // 1-12

  function updateParam(key: string, value: string | null) {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null || value === "") p.delete(key)
    else p.set(key, value)
    startTransition(() => router.push(`/finans/gelir-gider?${p.toString()}`))
  }

  const editingExpense = editId ? props.expenses.find((e) => e.id === editId) ?? null : null

  return (
    <div className="space-y-4">
      {/* Yıl filtresi + üst özet */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="text-sm font-medium">Yıl:</div>
            <Select value={String(props.year)} onValueChange={(v) => updateParam("year", v)}>
              <SelectTrigger className="w-[110px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2026, 2027, 2028].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {props.canEdit && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Yeni Gider
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4'lü özet KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigKpi
          label={`${props.year} Gelir`}
          value={tlForced(props.yearTotals.revenue)}
          sub="yıllık ciro"
          accent="emerald"
          icon={TrendingUp}
        />
        <BigKpi
          label="Pazaryeri Brüt"
          value={tlForced(props.yearTotals.brutMarketplace)}
          sub="komisyon + kargo + stopaj"
          accent="orange"
          icon={Store}
        />
        <BigKpi
          label="Operasyonel"
          value={tlForced(props.yearTotals.operational)}
          sub={`${props.expenses.length} kayıt`}
          accent="rose"
          icon={Wallet}
        />
        <BigKpi
          label="Net Kâr"
          value={tlForced(props.yearTotals.netProfit)}
          sub={`Marj ${pct(props.yearTotals.marginPct)}`}
          accent={props.yearTotals.netProfit >= 0 ? "emerald-strong" : "rose-strong"}
          icon={props.yearTotals.netProfit >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* TABLO 1: Gelir (Aylık) */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-emerald-50/40 dark:bg-emerald-950/20">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Gelir — Ay Bazında ({props.year})
            </h3>
          </div>
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-xs table-fixed min-w-[1280px] md:min-w-0">
              <PivotColgroup />
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium sticky left-0 bg-muted/30 z-10"></th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="px-2 py-2 font-medium text-right tabular-nums">{m}</th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right border-l">Toplam</th>
                </tr>
              </thead>
              <tbody>
                <SalesRow
                  label="Gelir"
                  values={props.monthlyAgg.map((r) => r.revenue)}
                  total={props.yearTotals.revenue}
                  bold
                />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Aylık Kayıt Durumu — her ay için manuel/dopigo kayıt + düzenleme */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-muted-foreground" />
              Aylık Veri Durumu
            </h3>
            <div className="text-[10px] text-muted-foreground flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Manuel
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Kayıtlı (Dopigo)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Canlı (henüz kayıt yok)
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5">
            {props.monthlyAgg.map((r) => {
              const dotClass =
                r.source === "MANUAL"
                  ? "bg-blue-500"
                  : r.source === "DOPIGO_SNAPSHOT"
                    ? "bg-emerald-500"
                    : "bg-amber-500"
              return (
                <button
                  key={r.month}
                  type="button"
                  onClick={() => props.canEdit && setEditMonthIdx(r.month)}
                  disabled={!props.canEdit}
                  className="rounded-md border p-2 text-center hover:bg-accent/30 transition-colors disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                    <span className="text-[10px] font-medium">{MONTH_NAMES[r.month - 1]}</span>
                  </div>
                  <div className="text-[10px] tabular-nums text-muted-foreground">
                    {r.revenue > 0 ? tlCompact(r.revenue) : "—"}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* TABLO 2: Brüt Giderler (Aylık) — sade */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-orange-50/40 dark:bg-orange-950/20">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Store className="h-4 w-4 text-orange-600" />
              Brüt Giderler — Ay Bazında (Pazaryeri Otomatik)
            </h3>
          </div>
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-xs table-fixed min-w-[1280px] md:min-w-0">
              <PivotColgroup />
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium sticky left-0 bg-muted/30 z-10"></th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="px-2 py-2 font-medium text-right tabular-nums">{m}</th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right border-l">Toplam</th>
                </tr>
              </thead>
              <tbody>
                <SalesRow
                  label="Alış Maliyeti"
                  values={props.monthlyAgg.map((r) => r.cost)}
                  total={props.yearTotals.cost}
                />
                <SalesRow
                  label="Komisyon"
                  values={props.monthlyAgg.map((r) => r.commission)}
                  total={props.yearTotals.commission}
                />
                <SalesRow
                  label="Kargo"
                  values={props.monthlyAgg.map((r) => r.shipping)}
                  total={props.yearTotals.shipping}
                />
                <SalesRow
                  label="Stopaj"
                  values={props.monthlyAgg.map((r) => r.withholding)}
                  total={props.yearTotals.withholding}
                />
                <SalesRow
                  label="Diğer"
                  values={props.monthlyAgg.map((r) => r.other)}
                  total={props.yearTotals.other}
                />
                <SalesRow
                  label="Toplam Brüt Gider"
                  values={props.monthlyAgg.map(
                    (r) => r.cost + r.commission + r.shipping + r.withholding + r.other,
                  )}
                  total={props.yearTotals.cost + props.yearTotals.brutMarketplace}
                  bold
                  highlightRow
                />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* TABLO 3: Net Giderler (Ay × Kategori pivot) */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-rose-50/40 dark:bg-rose-950/20 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-rose-600" />
              Net Giderler — Ay × Kategori
            </h3>
            <Badge variant="outline" className="text-[10px]">
              Toplam: {tlForced(props.yearTotals.operational)}
            </Badge>
          </div>
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-xs table-fixed min-w-[1280px] md:min-w-0">
              <PivotColgroup />
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium sticky left-0 bg-muted/30 z-10">
                    Kategori
                  </th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="px-2 py-2 font-medium text-right tabular-nums">{m}</th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right border-l">Yıllık</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <>
                    {/* Grup başlığı */}
                    <tr key={`group-${group.title}`} className="bg-muted/10">
                      <td
                        colSpan={14}
                        className="px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground sticky left-0 bg-muted/10 z-10"
                      >
                        {group.title}
                      </td>
                    </tr>
                    {/* Tüm kategorileri default göster (boş olsa da). Kullanıcı kayıt eklediğinde tutarlar dolar. */}
                    {group.categories.map((cat) => {
                      const monthData = props.expenseMatrix.byCategory[cat] ?? {}
                      const yearTotal = props.expenseMatrix.categoryTotal[cat] ?? 0
                      const hasData = yearTotal > 0
                      const isPersonelCat = EMPLOYEE_CATEGORIES.includes(cat)
                      const empBreakdown = isPersonelCat
                        ? props.expenseMatrix.employeeBreakdown[cat] ?? []
                        : []
                      return (
                        <>
                          <tr
                            key={cat}
                            className={`border-b hover:bg-accent/20 ${
                              !hasData ? "opacity-60" : ""
                            } ${isPersonelCat && hasData ? "font-medium" : ""}`}
                          >
                            <td className="px-3 py-2 sticky left-0 bg-card z-10">
                              {props.categoryLabels[cat] ?? cat}
                              {isPersonelCat && hasData && empBreakdown.length > 0 && (
                                <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                                  ({empBreakdown.length})
                                </span>
                              )}
                            </td>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                              <td
                                key={m}
                                className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap"
                                title={monthData[m] ? tlFull(monthData[m]) : undefined}
                              >
                                {tlCompact(monthData[m])}
                              </td>
                            ))}
                            <td
                              className={`px-2 py-2 text-right tabular-nums border-l whitespace-nowrap ${
                                hasData ? "font-semibold" : "text-muted-foreground/60"
                              }`}
                              title={hasData ? tlFull(yearTotal) : undefined}
                            >
                              {hasData ? tlCompact(yearTotal) : "—"}
                            </td>
                          </tr>
                          {/* Personel breakdown — alt satırlar */}
                          {isPersonelCat && empBreakdown.map((emp) => (
                            <tr
                              key={`${cat}-${emp.employeeId ?? "none"}`}
                              className="border-b text-muted-foreground hover:bg-accent/10 bg-muted/5"
                            >
                              <td className="px-3 py-1.5 sticky left-0 bg-muted/5 z-10 pl-8">
                                <span className="text-[11px]">↳ {emp.employeeName}</span>
                              </td>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <td
                                  key={m}
                                  className="px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap text-[11px]"
                                  title={emp.months[m] ? tlFull(emp.months[m]) : undefined}
                                >
                                  {tlCompact(emp.months[m])}
                                </td>
                              ))}
                              <td
                                className="px-2 py-1.5 text-right tabular-nums border-l whitespace-nowrap text-[11px]"
                                title={tlFull(emp.yearTotal)}
                              >
                                {tlCompact(emp.yearTotal)}
                              </td>
                            </tr>
                          ))}
                        </>
                      )
                    })}
                  </>
                ))}

                {/* Toplam satırı */}
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="px-3 py-2 sticky left-0 bg-muted/40 z-10">
                    OPERASYONEL TOPLAM
                  </td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <td
                      key={m}
                      className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap"
                      title={props.expenseMatrix.monthlyTotal[m] ? tlFull(props.expenseMatrix.monthlyTotal[m]) : undefined}
                    >
                      {tlCompact(props.expenseMatrix.monthlyTotal[m])}
                    </td>
                  ))}
                  <td
                    className="px-2 py-2 text-right tabular-nums border-l whitespace-nowrap"
                    title={tlFull(props.yearTotals.operational)}
                  >
                    {tlCompact(props.yearTotals.operational)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {props.expenses.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {props.year} yılı için operasyonel gider kaydı yok.
              {props.canEdit && (
                <div className="mt-2">
                  <Button size="sm" onClick={() => setCreateOpen(true)} variant="outline">
                    <Plus className="h-3.5 w-3.5 mr-1" /> İlk gider kaydı
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* TABLO 4: Net Kâr Özeti (Ay Bazında) */}
      <Card className="border-emerald-200/40 dark:border-emerald-800/40">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-emerald-50/40 dark:bg-emerald-950/20">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Net Kâr Özeti — Ay Bazında
            </h3>
          </div>
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-xs table-fixed min-w-[1280px] md:min-w-0">
              <PivotColgroup />
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium sticky left-0 bg-muted/30 z-10">Kalem</th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="px-2 py-2 font-medium text-right tabular-nums">{m}</th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right border-l">Yıllık</th>
                </tr>
              </thead>
              <tbody>
                <SalesRow
                  label="+ Gelir"
                  values={props.monthlyAgg.map((r) => r.revenue)}
                  total={props.yearTotals.revenue}
                  textClass="text-emerald-700 dark:text-emerald-400"
                  bold
                />
                <SalesRow
                  label="− Alış Maliyeti"
                  values={props.monthlyAgg.map((r) => -r.cost)}
                  total={-props.yearTotals.cost}
                  textClass="text-rose-700 dark:text-rose-400"
                  pctOf={props.monthlyAgg.map((r) => r.revenue)}
                />
                <SalesRow
                  label="− Brüt Pazaryeri"
                  values={props.monthlyAgg.map(
                    (r) => -(r.commission + r.shipping + r.withholding + r.other),
                  )}
                  total={-props.yearTotals.brutMarketplace}
                  textClass="text-rose-700 dark:text-rose-400"
                  pctOf={props.monthlyAgg.map((r) => r.revenue)}
                />
                <SalesRow
                  label="− Operasyonel"
                  values={Array.from({ length: 12 }, (_, i) =>
                    -(props.expenseMatrix.monthlyTotal[i + 1] ?? 0),
                  )}
                  total={-props.yearTotals.operational}
                  textClass="text-rose-700 dark:text-rose-400"
                  pctOf={props.monthlyAgg.map((r) => r.revenue)}
                />
                <tr className="border-t-2 bg-emerald-50/50 dark:bg-emerald-950/30 font-bold">
                  <td className="px-3 py-2.5 sticky left-0 bg-emerald-50/50 dark:bg-emerald-950/30 z-10">
                    = Net Kâr
                  </td>
                  {props.monthlyAgg.map((r) => {
                    const opEx = props.expenseMatrix.monthlyTotal[r.month] ?? 0
                    const net = r.revenue - r.cost - r.commission - r.shipping - r.withholding - r.other - opEx
                    const monthPct = r.revenue > 0 ? (net / r.revenue) * 100 : null
                    return (
                      <td
                        key={r.month}
                        className={`px-1.5 py-2.5 text-right tabular-nums whitespace-nowrap ${
                          net >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                        }`}
                        title={net !== 0 ? tlFull(net) : undefined}
                      >
                        {tlCompact(net)}
                        {monthPct !== null && net !== 0 && (
                          <div className="text-[9px] opacity-80 font-normal">
                            {monthPct.toFixed(1)}%
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td
                    className={`px-2 py-2.5 text-right tabular-nums border-l whitespace-nowrap ${
                      props.yearTotals.netProfit >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                    title={tlFull(props.yearTotals.netProfit)}
                  >
                    {tlCompact(props.yearTotals.netProfit)}
                    <div className="text-[10px] font-normal">
                      {pct(props.yearTotals.marginPct)}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Gider listesi (detaylı) */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold">Tüm Gider Kayıtları ({props.expenses.length})</h3>
          </div>
          {props.expenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Henüz gider kaydı yok.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="border-b bg-muted/20 sticky top-0">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Tarih</th>
                    <th className="px-2 py-2.5 font-medium">Kategori</th>
                    <th className="px-2 py-2.5 font-medium">Açıklama</th>
                    <th className="px-2 py-2.5 font-medium">Vendor</th>
                    <th className="px-2 py-2.5 font-medium">Periyot</th>
                    <th className="px-2 py-2.5 font-medium text-right">Tutar</th>
                    <th className="px-4 py-2.5 font-medium w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {props.expenses.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-accent/20">
                      <td className="px-4 py-2 whitespace-nowrap tabular-nums">{formatDate(e.expenseDate)}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {e.categoryLabel}
                        </Badge>
                        {e.customCategory && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {e.customCategory}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {e.description ?? <span className="text-muted-foreground">—</span>}
                        {e.invoiceNumber && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            #{e.invoiceNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{e.vendor ?? "—"}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {e.periodicityLabel}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">{tlForced(e.amount, 2)}</td>
                      <td className="px-4 py-2">
                        {props.canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditId(e.id)}
                            className="h-7 px-2 text-xs"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ExpenseDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        expense={null}
        defaultYear={props.year}
        employees={props.employees}
      />
      <ExpenseDialog
        open={editingExpense !== null}
        onClose={() => setEditId(null)}
        expense={editingExpense}
        defaultYear={props.year}
        employees={props.employees}
      />
      <MonthSnapshotDialog
        open={editMonthIdx !== null}
        onClose={() => setEditMonthIdx(null)}
        year={props.year}
        month={editMonthIdx ?? 0}
        existing={
          editMonthIdx !== null
            ? props.monthlyAgg.find((r) => r.month === editMonthIdx) ?? null
            : null
        }
      />
    </div>
  )
}

// ===== Sub: SalesRow (sales tablosu için ortak row) =====

function SalesRow({
  label,
  values,
  total,
  bold,
  asCount,
  highlightRow,
  textClass,
  pctOf,
}: {
  label: string
  values: number[]
  total: number
  bold?: boolean
  asCount?: boolean
  highlightRow?: boolean
  textClass?: string
  /** Verilirse her hücreye gelir yüzdesi gösterilir (Net Kâr Özeti için) */
  pctOf?: number[]
}) {
  const cls = textClass ?? ""
  return (
    <tr
      className={`border-b ${highlightRow ? "bg-muted/30 font-medium" : ""}`}
    >
      <td className={`px-3 py-2 sticky left-0 z-10 ${highlightRow ? "bg-muted/30" : "bg-card"} ${bold ? "font-semibold" : ""}`}>
        {label}
      </td>
      {values.map((v, i) => {
        const denominator = pctOf ? pctOf[i] : null
        const percentage =
          denominator != null && denominator !== 0 ? (Math.abs(v) / denominator) * 100 : null
        return (
          <td
            key={i}
            className={`px-1.5 py-2 text-right tabular-nums whitespace-nowrap ${cls}`}
            title={!asCount && v !== 0 ? tlFull(v) : undefined}
          >
            {asCount ? (v > 0 ? v.toLocaleString("tr-TR") : "—") : tlCompact(v)}
            {percentage != null && v !== 0 && (
              <div className="text-[9px] opacity-70">{percentage.toFixed(1)}%</div>
            )}
          </td>
        )
      })}
      <td
        className={`px-2 py-2 text-right tabular-nums border-l whitespace-nowrap ${bold ? "font-bold" : ""} ${cls}`}
        title={!asCount ? tlFull(total) : undefined}
      >
        {asCount ? total.toLocaleString("tr-TR") : tlCompact(total)}
        {pctOf && pctOf.reduce((s, x) => s + x, 0) !== 0 && (
          <div className="text-[9px] opacity-70 font-normal">
            {((Math.abs(total) / pctOf.reduce((s, x) => s + x, 0)) * 100).toFixed(1)}%
          </div>
        )}
      </td>
    </tr>
  )
}

// ===== Helpers =====

function BigKpi({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string
  value: string
  sub: string
  accent: "emerald" | "orange" | "rose" | "emerald-strong" | "rose-strong"
  icon: React.ComponentType<{ className?: string }>
}) {
  const bgClasses = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
    orange: "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400",
    rose: "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400",
    "emerald-strong": "bg-emerald-600 text-white",
    "rose-strong": "bg-rose-600 text-white",
  }
  return (
    <Card>
      <CardContent className="flex min-h-[132px] flex-col justify-center gap-2 p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bgClasses[accent]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

// ===== Expense Dialog =====

function ExpenseDialog({
  open,
  onClose,
  expense,
  defaultYear,
  employees,
}: {
  open: boolean
  onClose: () => void
  expense: ExpenseItem | null
  defaultYear: number
  employees: EmployeeRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const confirmDialog = useConfirm()

  const isEdit = expense !== null
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0")
  const defaultPeriod = `${defaultYear}-${currentMonth}`

  const [form, setForm] = useState({
    expenseDate: todayStr,
    period: defaultPeriod,
    category: "OTHER" as ExpenseCategory,
    customCategory: "",
    amount: "",
    periodicity: "ONE_TIME" as ExpensePeriodicity,
    description: "",
    vendor: "",
    employeeId: "" as string, // "" = atanmamış
    invoiceNumber: "",
    note: "",
  })

  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false)
  const [newEmployeeName, setNewEmployeeName] = useState("")
  const [creatingEmployee, startCreateEmployee] = useTransition()

  // Reset on open/expense change
  useEffect(() => {
    if (expense) {
      setForm({
        expenseDate: expense.expenseDate.slice(0, 10),
        period: expense.period,
        category: expense.category,
        customCategory: expense.customCategory ?? "",
        amount: formatMoneyDisplay(expense.amount.toFixed(2).replace(".", ",")),
        periodicity: expense.periodicity,
        description: expense.description ?? "",
        vendor: expense.vendor ?? "",
        employeeId: expense.employeeId ? String(expense.employeeId) : "",
        invoiceNumber: expense.invoiceNumber ?? "",
        note: expense.note ?? "",
      })
    } else {
      setForm({
        expenseDate: todayStr,
        period: defaultPeriod,
        category: "OTHER",
        customCategory: "",
        amount: "",
        periodicity: "ONE_TIME",
        description: "",
        vendor: "",
        employeeId: "",
        invoiceNumber: "",
        note: "",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense?.id, open])

  const isPersonelCategory = EMPLOYEE_CATEGORIES.includes(form.category)

  function addNewEmployee() {
    if (!newEmployeeName.trim()) return
    startCreateEmployee(async () => {
      const res = await createEmployeeAction({ name: newEmployeeName.trim() })
      if (!res.success || !res.data) {
        toast.error(res.success ? "Hata" : res.error)
        return
      }
      toast.success(`${res.data.name} eklendi`)
      setForm((prev) => ({ ...prev, employeeId: String(res.data!.id) }))
      setNewEmployeeName("")
      setNewEmployeeOpen(false)
      router.refresh()
    })
  }

  function submit() {
    const amt = parseMoneyInput(form.amount)
    if (amt === null || amt <= 0) {
      toast.error("Geçerli tutar gir")
      return
    }
    if (!/^\d{4}-\d{2}$/.test(form.period)) {
      toast.error("Dönem YYYY-MM formatında olmalı")
      return
    }
    startTransition(async () => {
      const payload = {
        expenseDate: new Date(form.expenseDate).toISOString(),
        period: form.period,
        category: form.category,
        customCategory: form.customCategory.trim() || null,
        amount: amt,
        periodicity: form.periodicity,
        description: form.description.trim() || null,
        vendor: form.vendor.trim() || null,
        employeeId: isPersonelCategory && form.employeeId ? Number(form.employeeId) : null,
        invoiceNumber: form.invoiceNumber.trim() || null,
        note: form.note.trim() || null,
      }
      const res = isEdit
        ? await updateExpenseAction(expense!.id, payload)
        : await createExpenseAction(payload)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(isEdit ? "Gider güncellendi" : "Gider kaydedildi")
      onClose()
      router.refresh()
    })
  }

  async function remove() {
    if (!expense) return
    const ok = await confirmDialog({
      title: "Gider silinsin mi?",
      description: "Bu kayıt kalıcı olarak silinecek. Geri alınamaz.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteExpenseAction(expense.id)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Gider silindi")
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Gider Düzenle" : "Yeni Gider"}</DialogTitle>
          <DialogDescription>Operasyonel gider kaydı.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Ödeme Tarihi</Label>
              <Input
                type="date"
                value={form.expenseDate}
                onChange={(e) => {
                  const d = e.target.value
                  const period = d ? d.slice(0, 7) : form.period
                  setForm({ ...form, expenseDate: d, period })
                }}
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Kategori</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUPS.map((group) => (
                    <div key={group.title}>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                        {group.title}
                      </div>
                      {group.categories.map((cat) => {
                        const c = CATEGORIES.find((x) => x.value === cat)
                        if (!c) return null
                        return (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        )
                      })}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Tutar (₺)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: formatMoneyDisplay(e.target.value) })}
                className="h-9 text-sm tabular-nums"
                placeholder="0,00"
                autoFocus={!isEdit}
              />
            </div>
          </div>

          {(form.category === "OTHER" || form.category === "SOFTWARE" || form.category === "INTEGRATION") && (
            <div>
              <Label className="text-[11px]">
                {form.category === "SOFTWARE"
                  ? "Yazılım adı (örn: MS365, Excel, Shopify)"
                  : form.category === "INTEGRATION"
                    ? "Entegrasyon adı"
                    : "Özel Kategori"}
              </Label>
              <Input
                value={form.customCategory}
                onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                className="h-9 text-sm"
                placeholder="Detay"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Periyot</Label>
              <Select
                value={form.periodicity}
                onValueChange={(v) => setForm({ ...form, periodicity: v as ExpensePeriodicity })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODICITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Vendor (opsiyonel)</Label>
              <Input
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                className="h-9 text-sm"
                placeholder="Kim ödedi/aldı"
              />
            </div>
          </div>

          {/* Personel seçimi — sadece SALARY/BONUS/MEAL/INSURANCE kategorilerinde */}
          {isPersonelCategory && (
            <div className="space-y-2 rounded-md bg-muted/30 p-3 border">
              <Label className="text-[11px] font-medium">Personel</Label>
              {newEmployeeOpen ? (
                <div className="flex gap-2">
                  <Input
                    value={newEmployeeName}
                    onChange={(e) => setNewEmployeeName(e.target.value)}
                    placeholder="Yeni personel adı"
                    className="h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addNewEmployee()
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={addNewEmployee}
                    disabled={creatingEmployee || !newEmployeeName.trim()}
                  >
                    {creatingEmployee ? "..." : "Ekle"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewEmployeeOpen(false)
                      setNewEmployeeName("")
                    }}
                    disabled={creatingEmployee}
                  >
                    Vazgeç
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={form.employeeId}
                    onValueChange={(v) => setForm({ ...form, employeeId: v })}
                  >
                    <SelectTrigger className="h-9 text-sm flex-1">
                      <SelectValue placeholder="Personel seç..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.filter((e) => e.isActive).length === 0 &&
                      employees.filter((e) => !e.isActive).length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Henüz personel yok
                        </div>
                      ) : (
                        <>
                          {employees.filter((e) => e.isActive).map((emp) => (
                            <SelectItem key={emp.id} value={String(emp.id)}>
                              {emp.name}
                              {emp.position ? ` · ${emp.position}` : ""}
                            </SelectItem>
                          ))}
                          {employees.filter((e) => !e.isActive).map((emp) => (
                            <SelectItem key={emp.id} value={String(emp.id)}>
                              {emp.name} (pasif)
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNewEmployeeOpen(true)}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Yeni
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Fatura No (opsiyonel)</Label>
              <Input
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="h-9 text-sm tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[11px]">Açıklama</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>

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

        <DialogFooter className="gap-2 sm:gap-2">
          {isEdit && (
            <Button variant="ghost" onClick={remove} disabled={pending} className="text-destructive mr-auto">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Sil
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={pending}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== Monthly Snapshot Dialog =====

function MonthSnapshotDialog({
  open,
  onClose,
  year,
  month,
  existing,
}: {
  open: boolean
  onClose: () => void
  year: number
  month: number
  existing: MonthlySalesRow | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fetching, startFetch] = useTransition()
  const confirmDialog = useConfirm()

  const [form, setForm] = useState({
    revenue: "",
    cost: "",
    commission: "",
    shipping: "",
    withholding: "",
    other: "",
  })

  useEffect(() => {
    if (existing) {
      setForm({
        revenue: formatMoneyDisplay(existing.revenue.toFixed(2).replace(".", ",")),
        cost: formatMoneyDisplay(existing.cost.toFixed(2).replace(".", ",")),
        commission: formatMoneyDisplay(existing.commission.toFixed(2).replace(".", ",")),
        shipping: formatMoneyDisplay(existing.shipping.toFixed(2).replace(".", ",")),
        withholding: formatMoneyDisplay(existing.withholding.toFixed(2).replace(".", ",")),
        other: formatMoneyDisplay(existing.other.toFixed(2).replace(".", ",")),
      })
    }
  }, [existing?.month, open])

  const isSnapshot = existing?.source === "MANUAL" || existing?.source === "DOPIGO_SNAPSHOT"

  function fetchFromDopigo() {
    startFetch(async () => {
      const res = await fetchDopigoMonthAction(year, month)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setForm({
        revenue: formatMoneyDisplay(res.data.revenue.toFixed(2).replace(".", ",")),
        cost: formatMoneyDisplay(res.data.cost.toFixed(2).replace(".", ",")),
        commission: formatMoneyDisplay(res.data.commission.toFixed(2).replace(".", ",")),
        shipping: formatMoneyDisplay(res.data.shipping.toFixed(2).replace(".", ",")),
        withholding: formatMoneyDisplay(res.data.withholding.toFixed(2).replace(".", ",")),
        other: formatMoneyDisplay(res.data.other.toFixed(2).replace(".", ",")),
      })
      toast.success("Dopigo verisi getirildi (henüz kaydedilmedi)")
    })
  }

  function save(isManual: boolean) {
    const revenue = parseMoneyInput(form.revenue) ?? 0
    const cost = parseMoneyInput(form.cost) ?? 0
    const commission = parseMoneyInput(form.commission) ?? 0
    const shipping = parseMoneyInput(form.shipping) ?? 0
    const withholding = parseMoneyInput(form.withholding) ?? 0
    const other = parseMoneyInput(form.other) ?? 0
    startTransition(async () => {
      const res = await saveMonthlySnapshotAction({
        year,
        month,
        revenue,
        cost,
        commission,
        shipping,
        withholding,
        other,
        isManual,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(`${MONTH_NAMES[month - 1]} ${year} kaydedildi`)
      onClose()
      router.refresh()
    })
  }

  async function removeSnapshot() {
    const ok = await confirmDialog({
      title: "Kayıt silinsin mi?",
      description: `${MONTH_NAMES[month - 1]} ${year} snapshot'ı silinecek. Bu aydan sonra Dopigo canlı verisi gösterilir.`,
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteMonthlySnapshotAction(year, month)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Kayıt silindi (Dopigo canlı veri aktif)")
      onClose()
      router.refresh()
    })
  }

  const monthLabel = month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : ""

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {monthLabel} {year} — Aylık Kayıt
          </DialogTitle>
          <DialogDescription>
            {existing?.source === "MANUAL"
              ? "Manuel kaydedilmiş (geçmiş ay). Tutarları düzenleyebilirsin."
              : existing?.source === "DOPIGO_SNAPSHOT"
                ? "Dopigo'dan kaydedilmiş. Tutarları gerekirse düzelt."
                : "Henüz kayıt yok. Manuel gir veya Dopigo'dan al."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchFromDopigo}
              disabled={fetching}
              className="gap-1.5"
            >
              {fetching ? "Yükleniyor..." : "↻ Dopigo'dan Doldur"}
            </Button>
          </div>

          <div>
            <Label className="text-[11px]">Gelir (Ciro) ₺</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.revenue}
              onChange={(e) => setForm({ ...form, revenue: formatMoneyDisplay(e.target.value) })}
              className="h-9 text-sm tabular-nums"
              placeholder="0,00"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Alış Maliyeti ₺</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: formatMoneyDisplay(e.target.value) })}
                className="h-9 text-sm tabular-nums"
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-[11px]">Komisyon ₺</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.commission}
                onChange={(e) => setForm({ ...form, commission: formatMoneyDisplay(e.target.value) })}
                className="h-9 text-sm tabular-nums"
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-[11px]">Kargo ₺</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.shipping}
                onChange={(e) => setForm({ ...form, shipping: formatMoneyDisplay(e.target.value) })}
                className="h-9 text-sm tabular-nums"
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-[11px]">Stopaj ₺</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.withholding}
                onChange={(e) => setForm({ ...form, withholding: formatMoneyDisplay(e.target.value) })}
                className="h-9 text-sm tabular-nums"
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-[11px]">Diğer ₺</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.other}
                onChange={(e) => setForm({ ...form, other: formatMoneyDisplay(e.target.value) })}
                className="h-9 text-sm tabular-nums"
                placeholder="0,00"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          {isSnapshot && (
            <Button
              variant="ghost"
              onClick={removeSnapshot}
              disabled={pending}
              className="text-destructive mr-auto"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Kaydı Sil
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={pending}>Vazgeç</Button>
          <Button
            variant="outline"
            onClick={() => save(false)}
            disabled={pending}
            title="Dopigo'dan alındı olarak kaydet"
          >
            {pending ? "..." : "Dopigo olarak kaydet"}
          </Button>
          <Button onClick={() => save(true)} disabled={pending}>
            {pending ? "Kaydediliyor..." : "Manuel kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
