"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { useConfirm } from "@/components/common/confirm-provider"
import {
  CheckCircle2,
  XCircle,
  Package,
  RefreshCw,
  Repeat,
  AlertTriangle,
  FileSpreadsheet,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  Users,
  Search,
  X,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  completeExchangeAction,
  completeExchangesBatchAction,
  cancelExchangeAction,
  deleteExchangeAction,
  lookupBarcodeAction,
  exportPendingExchangesAction,
  type CounterpartyOption,
  type ExchangeProductInfo,
} from "./actions"
import { Trash2 } from "lucide-react"
import { formatDateTime } from "@/lib/utils"

export interface PendingExchange {
  id: number
  direction: "GIVEN" | "RECEIVED"
  quantity: number
  quantityToStock: number
  unitPrice: number | null
  note: string | null
  createdAt: string
  counterparty: { id: number; name: string; type: "PHARMACY" | "DISTRIBUTOR" | "INDIVIDUAL" }
  product: { id: number; name: string; primaryBarcode: string; mainStock: number; exchangeStock: number }
}

interface Props {
  pending: PendingExchange[]
  counterparties: CounterpartyOption[]
  isAdmin?: boolean
}

// Gün hesabı — createdAt'ten bugüne
function daysSince(isoDate: string): number {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  return Math.floor((now - then) / (1000 * 60 * 60 * 24))
}

function waitingLabel(days: number): { label: string; urgent: boolean; warn: boolean } {
  if (days <= 0) return { label: "Bugün", urgent: false, warn: false }
  if (days === 1) return { label: "1 gün", urgent: false, warn: false }
  if (days < 7) return { label: `${days} gün`, urgent: false, warn: false }
  if (days < 14) return { label: `${days} gün`, urgent: false, warn: true }
  return { label: `${days} gün`, urgent: true, warn: true }
}

// Group by counterparty + same minute timestamp
interface PendingGroup {
  key: string
  counterparty: PendingExchange["counterparty"]
  direction: "GIVEN" | "RECEIVED"
  createdAt: string
  items: PendingExchange[]
  totalQty: number
  oldestDays: number
}

function groupExchanges(items: PendingExchange[]): PendingGroup[] {
  const map = new Map<string, PendingGroup>()
  for (const ex of items) {
    // Aynı dakikada aynı cari + aynı yön — tek batch
    const minuteBucket = Math.floor(new Date(ex.createdAt).getTime() / (60 * 1000))
    const key = `${ex.counterparty.id}__${ex.direction}__${minuteBucket}`
    const existing = map.get(key)
    if (existing) {
      existing.items.push(ex)
      existing.totalQty += ex.quantity
      const d = daysSince(ex.createdAt)
      if (d > existing.oldestDays) existing.oldestDays = d
    } else {
      map.set(key, {
        key,
        counterparty: ex.counterparty,
        direction: ex.direction,
        createdAt: ex.createdAt,
        items: [ex],
        totalQty: ex.quantity,
        oldestDays: daysSince(ex.createdAt),
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.oldestDays - a.oldestDays)
}

export function PendingList({ pending, counterparties, isAdmin = false }: Props) {
  const [exporting, startExport] = useTransition()
  const [counterpartyFilter, setCounterpartyFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  // Filtre uygulanmış pending
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pending.filter((ex) => {
      if (counterpartyFilter !== "all" && String(ex.counterparty.id) !== counterpartyFilter) return false
      if (q) {
        const hay = (ex.product.name + " " + ex.product.primaryBarcode + " " + ex.counterparty.name).toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [pending, counterpartyFilter, search])

  // Giriş / Çıkış ayrımı
  const receivedPending = filtered.filter((ex) => ex.direction === "RECEIVED")
  const givenPending = filtered.filter((ex) => ex.direction === "GIVEN")

  // Eski bekleyenler - 7 gün ve üstü
  const overdueCount = filtered.filter((ex) => daysSince(ex.createdAt) >= 7).length
  const receivedOverdue = receivedPending.filter((ex) => daysSince(ex.createdAt) >= 7).length
  const givenOverdue = givenPending.filter((ex) => daysSince(ex.createdAt) >= 7).length

  // Grupla
  const receivedGroups = useMemo(() => groupExchanges(receivedPending), [receivedPending])
  const givenGroups = useMemo(() => groupExchanges(givenPending), [givenPending])

  // Selection state — exchange id bazlı
  const [selectedReceived, setSelectedReceived] = useState<Set<number>>(new Set())
  const [selectedGiven, setSelectedGiven] = useState<Set<number>>(new Set())

  function toggleReceived(id: number) {
    setSelectedReceived((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleGiven(id: number) {
    setSelectedGiven((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAllReceived() {
    if (selectedReceived.size === receivedPending.length) {
      setSelectedReceived(new Set())
    } else {
      setSelectedReceived(new Set(receivedPending.map((e) => e.id)))
    }
  }
  function toggleAllGiven() {
    if (selectedGiven.size === givenPending.length) {
      setSelectedGiven(new Set())
    } else {
      setSelectedGiven(new Set(givenPending.map((e) => e.id)))
    }
  }

  function toggleGroupSelection(group: PendingGroup, isGiven: boolean) {
    const ids = group.items.map((i) => i.id)
    const setterIs = isGiven ? selectedGiven : selectedReceived
    const allSelected = ids.every((id) => setterIs.has(id))
    if (isGiven) {
      setSelectedGiven((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
        return next
      })
    } else {
      setSelectedReceived((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
        return next
      })
    }
  }

  function handleExport(
    direction: "ALL" | "RECEIVED" | "GIVEN" = "ALL",
    counterpartyIdOverride?: number | null,
  ) {
    if (filtered.length === 0) return
    // Cari filtresi seçiliyse + override yoksa o cariye göre export
    const cpId =
      counterpartyIdOverride !== undefined
        ? counterpartyIdOverride
        : counterpartyFilter !== "all"
          ? Number(counterpartyFilter)
          : null
    startExport(async () => {
      const result = await exportPendingExchangesAction({
        direction,
        counterpartyId: cpId,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      try {
        const binary = atob(result.data.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = result.data.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`${result.data.count} bekleyen takas Excel'e aktarıldı`)
      } catch (err) {
        toast.error("Dosya indirme hatası: " + (err instanceof Error ? err.message : "bilinmeyen"))
      }
    })
  }

  if (pending.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Bekleyen takas yok.
        </CardContent>
      </Card>
    )
  }

  // Aktif cari'leri filter dropdown için say
  const activeCounterpartyIds = new Set(pending.map((p) => p.counterparty.id))
  const availableCounterparties = counterparties.filter((c) => activeCounterpartyIds.has(c.id))

  const hasFilter = counterpartyFilter !== "all" || search.trim() !== ""

  return (
    <div className="space-y-4">
      {/* Header — genel özet + Excel (hepsi) butonu */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{filtered.length}</span> bekleyen takas
            <span className="ml-1 text-xs">
              ({receivedPending.length} giriş, {givenPending.length} çıkış)
            </span>
          </span>
          {overdueCount > 0 && (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive gap-1.5"
            >
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} tanesi 7+ gün bekliyor
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleExport("ALL")}
          disabled={exporting}
          className="gap-1.5"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {exporting
            ? "Hazırlanıyor…"
            : counterpartyFilter !== "all"
              ? `${availableCounterparties.find((c) => String(c.id) === counterpartyFilter)?.name ?? "Cari"} — Excel`
              : "Hepsini Excel'e İndir"}
        </Button>
      </div>

      {/* Filter bar — cari + arama */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı, barkod veya cari ara..."
                className="pl-9 h-9 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-2.5"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            <Select value={counterpartyFilter} onValueChange={setCounterpartyFilter}>
              <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Tüm Cariler" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Cariler ({availableCounterparties.length})</SelectItem>
                {availableCounterparties.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("")
                  setCounterpartyFilter("all")
                }}
                className="h-9 text-xs text-muted-foreground"
              >
                Temizle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs
        defaultValue={receivedPending.length >= givenPending.length ? "giris" : "cikis"}
        className="space-y-3"
      >
        <TabsList>
          <TabsTrigger value="giris" className="gap-2">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Giriş (Alınan)
            {receivedPending.length > 0 && (
              <Badge
                variant="secondary"
                className={
                  "ml-1 tabular-nums " +
                  (receivedOverdue > 0 ? "bg-destructive/15 text-destructive" : "")
                }
              >
                {receivedPending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cikis" className="gap-2">
            <ArrowUpFromLine className="h-3.5 w-3.5" />
            Çıkış (Verilen)
            {givenPending.length > 0 && (
              <Badge
                variant="secondary"
                className={
                  "ml-1 tabular-nums " +
                  (givenOverdue > 0 ? "bg-destructive/15 text-destructive" : "")
                }
              >
                {givenPending.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="giris" className="space-y-3">
          <SubSectionHeader
            title="Eczaneden alınan, onay bekleyen takaslar (Senaryo A)"
            count={receivedPending.length}
            overdueCount={receivedOverdue}
            onExport={() => handleExport("RECEIVED")}
            exporting={exporting}
            emptyMessage={hasFilter ? "Filtreye uyan giriş takası yok." : "Bekleyen giriş takası yok."}
            allSelected={
              receivedPending.length > 0 && selectedReceived.size === receivedPending.length
            }
            onToggleAll={toggleAllReceived}
          />
          {selectedReceived.size > 0 && (
            <BatchActionBar
              kind="RECEIVED"
              selected={receivedPending.filter((ex) => selectedReceived.has(ex.id))}
              onClear={() => setSelectedReceived(new Set())}
            />
          )}
          {receivedGroups.map((group) => (
            <PendingGroupCard
              key={group.key}
              group={group}
              selectedIds={selectedReceived}
              onToggleItem={toggleReceived}
              onToggleGroup={() => toggleGroupSelection(group, false)}
              isAdmin={isAdmin}
            />
          ))}
        </TabsContent>

        <TabsContent value="cikis" className="space-y-3">
          <SubSectionHeader
            title="Verilen, fatura/iade bekleyen takaslar (Senaryo B ve C)"
            count={givenPending.length}
            overdueCount={givenOverdue}
            onExport={() => handleExport("GIVEN")}
            exporting={exporting}
            emptyMessage={hasFilter ? "Filtreye uyan çıkış takası yok." : "Bekleyen çıkış takası yok."}
            allSelected={givenPending.length > 0 && selectedGiven.size === givenPending.length}
            onToggleAll={toggleAllGiven}
          />
          {selectedGiven.size > 0 && (
            <BatchActionBar
              kind="GIVEN"
              selected={givenPending.filter((ex) => selectedGiven.has(ex.id))}
              onClear={() => setSelectedGiven(new Set())}
            />
          )}
          {givenGroups.map((group) => (
            <PendingGroupCard
              key={group.key}
              group={group}
              selectedIds={selectedGiven}
              onToggleItem={toggleGiven}
              onToggleGroup={() => toggleGroupSelection(group, true)}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SubSectionHeader({
  title,
  count,
  overdueCount,
  onExport,
  exporting,
  emptyMessage,
  allSelected,
  onToggleAll,
}: {
  title: string
  count: number
  overdueCount: number
  onExport: () => void
  exporting: boolean
  emptyMessage: string
  allSelected: boolean
  onToggleAll: () => void
}) {
  if (count === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
          <span className="text-xs">Tümünü seç</span>
        </label>
        <span className="hidden sm:inline text-muted-foreground">·</span>
        <span>{title}</span>
        {overdueCount > 0 && (
          <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
            <AlertTriangle className="h-3 w-3" />
            {overdueCount} adet 7+ gün
          </Badge>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onExport}
        disabled={exporting}
        className="h-7 gap-1.5 text-xs"
      >
        <FileSpreadsheet className="h-3 w-3" />
        Bu listeyi Excel'e aktar
      </Button>
    </div>
  )
}

// ==================== Batch Action Bar ====================
function BatchActionBar({
  kind,
  selected,
  onClear,
}: {
  kind: "RECEIVED" | "GIVEN"
  selected: PendingExchange[]
  onClear: () => void
}) {
  const [submitting, startSubmit] = useTransition()
  const confirmDialog = useConfirm()

  const pharmacyItems = selected.filter((ex) => ex.counterparty.type === "PHARMACY")
  const nonPharmacyItems = selected.filter((ex) => ex.counterparty.type !== "PHARMACY")
  const allPharmacy = kind === "GIVEN" && pharmacyItems.length === selected.length
  const allNonPharmacy = kind === "GIVEN" && nonPharmacyItems.length === selected.length
  const mixedGiven = kind === "GIVEN" && !allPharmacy && !allNonPharmacy

  async function runBatch(mode: "COMPLETE" | "RETURNED_SAME", confirmMsg: string) {
    const ok = await confirmDialog({
      title: "Toplu işlem onayı",
      description: confirmMsg,
      confirmText: "Onayla",
    })
    if (!ok) return
    startSubmit(async () => {
      const result = await completeExchangesBatchAction({
        exchangeIds: selected.map((ex) => ex.id),
        mode,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const { completed, errors } = result.data
      if (errors.length > 0) {
        toast.warning(`${completed} tamamlandı, ${errors.length} tanesi atlandı`)
      } else {
        toast.success(`${completed} takas toplu olarak tamamlandı`)
      }
      onClear()
    })
  }

  return (
    <div className="sticky top-2 z-10 rounded-lg border-2 border-primary/40 bg-primary/5 backdrop-blur-sm px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>
            <span className="tabular-nums">{selected.length}</span> takas seçildi
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {kind === "RECEIVED" && (
            <Button
              size="sm"
              onClick={() =>
                runBatch(
                  "COMPLETE",
                  `${selected.length} takasın tümünü "Eczane Onayladı" olarak işaretle?`
                )
              }
              disabled={submitting}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {submitting ? "İşleniyor…" : `Tümünü Onayla (${selected.length})`}
            </Button>
          )}

          {kind === "GIVEN" && allPharmacy && (
            <Button
              size="sm"
              onClick={() =>
                runBatch(
                  "COMPLETE",
                  `${selected.length} takasın tümü için "fatura kesildi" olarak kapat? Takas stoktan düşülecek.`
                )
              }
              disabled={submitting}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {submitting ? "İşleniyor…" : `Tümünün Faturası Kesildi (${selected.length})`}
            </Button>
          )}

          {kind === "GIVEN" && allNonPharmacy && (
            <Button
              size="sm"
              onClick={() =>
                runBatch(
                  "RETURNED_SAME",
                  `${selected.length} takasın tümü için "aynı ürün geri geldi" olarak işaretle? Takas stoktan çıkıp ana stoğa geri dönecek.`
                )
              }
              disabled={submitting}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {submitting ? "İşleniyor…" : `Hepsinden Aynı Ürün Geldi (${selected.length})`}
            </Button>
          )}

          {mixedGiven && (
            <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5 max-w-sm">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Eczane + dış cari karışık. Toplu tamamlama için ya hepsi Eczane ya hepsi dış cari olmalı.</span>
            </div>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={submitting}
            className="text-muted-foreground"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Seçimi temizle
          </Button>
        </div>
      </div>
    </div>
  )
}

// ==================== Grouped Card ====================

function PendingGroupCard({
  group,
  selectedIds,
  onToggleItem,
  onToggleGroup,
  isAdmin = false,
}: {
  group: PendingGroup
  selectedIds: Set<number>
  onToggleItem: (id: number) => void
  onToggleGroup: () => void
  isAdmin?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const isReceived = group.direction === "RECEIVED"
  const isPharmacy = group.counterparty.type === "PHARMACY"
  const scenario = isReceived ? "A" : isPharmacy ? "B" : "C"
  const waiting = waitingLabel(group.oldestDays)

  const groupAllSelected = group.items.every((i) => selectedIds.has(i.id))
  const groupPartial = !groupAllSelected && group.items.some((i) => selectedIds.has(i.id))

  const scenarioLabel = {
    A: "Giriş (A — eczaneden alındı)",
    B: "Çıkış (B — müşteriye verildi)",
    C: "Çıkış (C — dış cari)",
  }[scenario]

  const cardBorderClass =
    groupAllSelected || groupPartial
      ? "border-primary/60 ring-1 ring-primary/20 bg-primary/5"
      : waiting.urgent
        ? "border-destructive/40 shadow-sm shadow-destructive/10"
        : waiting.warn
          ? "border-amber-500/40"
          : "hover:border-primary/30 hover:shadow-sm"

  // İkonun arkaplan rengi senaryoya göre
  const iconBgClass = isReceived
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    : isPharmacy
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
      : "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"

  const scenarioInfo = {
    A: { label: "Giriş", sub: "Eczaneden alındı" },
    B: { label: "Çıkış", sub: "Müşteriye verildi" },
    C: { label: "Çıkış", sub: "Dış cari" },
  }[scenario]

  return (
    <Card className={`transition-all ${cardBorderClass}`}>
      <CardContent className="p-0">
        {/* Header — tıklanabilir (expand/collapse) */}
        <div className="flex items-stretch gap-3 p-4">
          <div className="flex items-center pt-1">
            <Checkbox
              checked={groupAllSelected ? true : groupPartial ? "indeterminate" : false}
              onCheckedChange={onToggleGroup}
              aria-label="Grup seç"
            />
          </div>

          {/* İkon */}
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}>
            {isReceived ? <Package className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-1 text-left flex items-center justify-between gap-3 min-w-0"
          >
            <div className="flex-1 min-w-0">
              {/* Üst satır: Cari adı + senaryo etiketi */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{group.counterparty.name}</span>
                <Badge variant="outline" className="text-[10px] font-medium">
                  {scenarioInfo.label} · {scenarioInfo.sub}
                </Badge>
                {waiting.urgent ? (
                  <Badge variant="outline" className="gap-1 text-[10px] border-destructive/40 text-destructive">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {waiting.label}
                  </Badge>
                ) : waiting.warn ? (
                  <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">
                    <Clock className="h-2.5 w-2.5" />
                    {waiting.label}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {waiting.label}
                  </Badge>
                )}
              </div>
              {/* Alt satır: kalem · adet · tarih */}
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                <span className="font-medium text-foreground tabular-nums">
                  {group.items.length} kalem
                </span>
                <span>·</span>
                <span className="tabular-nums">{group.totalQty} adet</span>
                <span>·</span>
                <span className="tabular-nums">{formatDateTime(group.createdAt)}</span>
              </div>
            </div>
            <div
              className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                expanded ? "bg-accent text-foreground" : "text-muted-foreground"
              }`}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
              />
            </div>
          </button>
        </div>

        {/* Expanded: kalemler */}
        {expanded && (
          <div className="border-t bg-muted/30 px-4 py-3 space-y-2">
            {group.items.map((ex) => (
              <PendingItemRow
                key={ex.id}
                exchange={ex}
                selected={selectedIds.has(ex.id)}
                onToggleSelect={() => onToggleItem(ex.id)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PendingItemRow({
  exchange: ex,
  selected,
  onToggleSelect,
  isAdmin = false,
}: {
  exchange: PendingExchange
  selected: boolean
  onToggleSelect: () => void
  isAdmin?: boolean
}) {
  const [completing, startComplete] = useTransition()
  const [cancelling, startCancel] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const confirmDialog = useConfirm()

  const isReceived = ex.direction === "RECEIVED"
  const isPharmacy = ex.counterparty.type === "PHARMACY"
  const scenario = isReceived ? "A" : isPharmacy ? "B" : "C"
  const passThrough = ex.quantity - ex.quantityToStock

  function runComplete(mode: "COMPLETE" | "RETURNED_SAME") {
    startComplete(async () => {
      const result = await completeExchangeAction({ exchangeId: ex.id, mode })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Takas tamamlandı")
    })
  }

  async function runCancel() {
    const ok = await confirmDialog({
      title: "Takas iptal edilecek",
      description: "Stok hareketleri geri alınır. Bu işlem geri alınamaz.",
      confirmText: "Evet, iptal et",
      variant: "destructive",
    })
    if (!ok) return
    startCancel(async () => {
      const result = await cancelExchangeAction(ex.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Takas iptal edildi")
    })
  }

  async function runDelete() {
    const ok = await confirmDialog({
      title: "Takas TAMAMEN silinecek",
      description:
        "⚠ Bu işlem geri alınamaz. Bekleyense önce iptal edilir (stok geri alınır), sonra DB'den silinir. Stok hareket audit kayıtları kalır.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startDelete(async () => {
      const result = await deleteExchangeAction(ex.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Takas silindi")
    })
  }

  return (
    <div
      className={`rounded-md border bg-background p-3 space-y-2 ${
        selected ? "border-primary/60 bg-primary/5" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          className="mt-0.5"
          aria-label={`#${ex.id} seç`}
        />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{ex.product.name}</span>
            <span className="text-xs text-muted-foreground">
              × <span className="tabular-nums font-semibold text-foreground">{ex.quantity}</span>
            </span>
            <Badge variant="outline" className="text-[9px] tabular-nums">
              #{ex.id}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            <span>
              Barkod: <span className="text-foreground tabular-nums">{ex.product.primaryBarcode}</span>
            </span>
            <span>
              Mevcut stok: <span className="text-foreground tabular-nums">{ex.product.mainStock}</span>
            </span>
            <span>
              Takasta: <span className="text-foreground tabular-nums">{ex.product.exchangeStock}</span>
            </span>
            {isReceived && ex.quantityToStock > 0 && (
              <span>
                Stoğa: <span className="text-foreground tabular-nums">{ex.quantityToStock}</span>
                {ex.unitPrice != null && ` · ₺${ex.unitPrice.toFixed(2)}/adet`}
              </span>
            )}
            {isReceived && passThrough > 0 && (
              <span>
                Doğrudan satışa: <span className="text-foreground tabular-nums">{passThrough}</span>
              </span>
            )}
          </div>
          {ex.note && (
            <p className="text-[11px] italic text-muted-foreground border-l-2 pl-2 py-0.5">{ex.note}</p>
          )}
        </div>
      </div>

      {/* Aksiyonlar */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {scenario === "A" && (
          <Button
            size="sm"
            onClick={() => runComplete("COMPLETE")}
            disabled={completing || cancelling}
            className="gap-1.5 h-7 text-xs"
          >
            <CheckCircle2 className="h-3 w-3" />
            Eczane Onayladı
          </Button>
        )}
        {scenario === "B" && (
          <Button
            size="sm"
            onClick={() => runComplete("COMPLETE")}
            disabled={completing || cancelling}
            className="gap-1.5 h-7 text-xs"
          >
            <CheckCircle2 className="h-3 w-3" />
            Fatura Kesildi
          </Button>
        )}
        {scenario === "C" && (
          <>
            <Button
              size="sm"
              onClick={() => runComplete("RETURNED_SAME")}
              disabled={completing || cancelling}
              className="gap-1.5 h-7 text-xs"
            >
              <CheckCircle2 className="h-3 w-3" />
              Aynı Ürün Geldi
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDiffDialogOpen(true)}
              disabled={completing || cancelling}
              className="gap-1.5 h-7 text-xs"
            >
              <Repeat className="h-3 w-3" />
              Farklı Ürünle Karşılık
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={runCancel}
          disabled={completing || cancelling || deleting}
          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
        >
          <XCircle className="h-3 w-3" />
          İptal
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="ghost"
            onClick={runDelete}
            disabled={completing || cancelling || deleting}
            className="gap-1.5 h-7 text-xs text-destructive hover:bg-destructive/10"
            title="Admin: takas DB'den tamamen silinir"
          >
            <Trash2 className="h-3 w-3" />
            Sil
          </Button>
        )}
      </div>

      {scenario === "C" && (
        <DifferentReturnDialog
          open={diffDialogOpen}
          onClose={() => setDiffDialogOpen(false)}
          exchange={ex}
        />
      )}
    </div>
  )
}

function DifferentReturnDialog({
  open,
  onClose,
  exchange: ex,
}: {
  open: boolean
  onClose: () => void
  exchange: PendingExchange
}) {
  const [barcodeInput, setBarcodeInput] = useState("")
  const [returnedProduct, setReturnedProduct] = useState<ExchangeProductInfo | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState("")
  const [note, setNote] = useState("")

  const [lookingUp, startLookup] = useTransition()
  const [submitting, startSubmit] = useTransition()

  function reset() {
    setBarcodeInput("")
    setReturnedProduct(null)
    setQuantity(1)
    setUnitPrice("")
    setNote("")
  }

  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return
    e.preventDefault()
    const val = barcodeInput.trim()
    if (!val) return
    startLookup(async () => {
      const result = await lookupBarcodeAction(val)
      if (!result.found) {
        toast.error(`Barkod bulunamadı: ${val}`)
        return
      }
      if (result.blocked) {
        toast.error(result.blockReason ?? "Bu ürün seçilemez")
        return
      }
      if (!result.product) {
        toast.error("Ürün bilgisi alınamadı")
        return
      }
      setReturnedProduct(result.product)
    })
  }

  function handleSubmit() {
    if (!returnedProduct) {
      toast.error("Karşılık ürün seçmelisiniz")
      return
    }
    if (quantity <= 0) {
      toast.error("Miktar sıfırdan büyük olmalı")
      return
    }
    const priceNum = unitPrice ? Number(unitPrice) : null
    if (unitPrice && (priceNum == null || isNaN(priceNum) || priceNum < 0)) {
      toast.error("Geçersiz fiyat")
      return
    }

    startSubmit(async () => {
      const result = await completeExchangeAction({
        exchangeId: ex.id,
        mode: "RETURNED_DIFFERENT",
        returnedProductId: returnedProduct.id,
        returnedQuantity: quantity,
        returnedUnitPrice: priceNum,
        returnedNote: note.trim() || null,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Takas tamamlandı — ${returnedProduct.name} stoğa eklendi`)
      reset()
      onClose()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Farklı Ürünle Karşılık</DialogTitle>
          <DialogDescription>
            &quot;{ex.product.name}&quot; × {ex.quantity} verdin. Karşılığında hangi ürün geldi?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="return-barcode">Gelen ürün barkodu</Label>
            <Input
              id="return-barcode"
              placeholder="Barkodu okutun, Enter'a basın"
              value={barcodeInput}
              onChange={(e) => {
                setBarcodeInput(e.target.value)
                if (returnedProduct) setReturnedProduct(null)
              }}
              onKeyDown={handleBarcodeKeyDown}
              disabled={lookingUp || submitting}
              autoFocus
            />
          </div>

          {returnedProduct && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div>
                <p className="font-medium text-sm">{returnedProduct.name}</p>
                {returnedProduct.brandName && (
                  <p className="text-xs text-muted-foreground">{returnedProduct.brandName}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="return-qty">Miktar</Label>
                  <Input
                    id="return-qty"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="return-price">Alış ₺/adet (ops.)</Label>
                  <Input
                    id="return-price"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0.00"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="return-note">Not (ops.)</Label>
                <Textarea
                  id="return-note"
                  rows={2}
                  placeholder="Örn: değer eşitlendi"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="resize-none"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={submitting}
          >
            Vazgeç
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !returnedProduct}>
            {submitting ? "Tamamlanıyor…" : "Tamamla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
