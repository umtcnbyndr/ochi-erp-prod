"use client"

import { useState, useTransition, useRef, useMemo } from "react"
import { toast } from "sonner"
import {
  RefreshCw,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Link2,
  ArrowRight,
  Download,
  FileSpreadsheet,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  syncTrendyolListingsAction,
  importDopigoSnapshotAction,
  buildMatchTableAction,
  attachBarcodeAction,
  bulkAttachBarcodesAction,
  searchProductsForOrphanAction,
  exportBrandProductsExcelAction,
  importMatchExcelAction,
  type SnapshotStatus,
} from "./actions"
import type {
  ThreeWayMatchRow,
  ThreeWayMatchSummary,
} from "@/lib/services/barcode-match"

interface BrandOption {
  id: number
  name: string
  productCount: number
}

interface Props {
  brands: BrandOption[]
  initialStatus: SnapshotStatus
}

export function MatchFlow({ brands, initialStatus }: Props) {
  const [status, setStatus] = useState<SnapshotStatus>(initialStatus)
  const [brandId, setBrandId] = useState<string>("_all")
  const [showOnly, setShowOnly] = useState<"ALL" | "MISSING" | "FUZZY" | "ORPHAN">("ALL")
  const [match, setMatch] = useState<{
    rows: ThreeWayMatchRow[]
    summary: ThreeWayMatchSummary
    orphansTrendyol: Array<{
      barcode: string
      title: string
      brand: string | null
      salePrice: number | null
      quantity: number | null
      approved: boolean
    }>
    orphansDopigo: Array<{
      barcode: string | null
      sku: string | null
      name: string
      merchantSku: string | null
    }>
  } | null>(null)

  // Orphan filtreleri
  const [tyOrphanBrand, setTyOrphanBrand] = useState<string>("_all")
  const [tyOrphanStock, setTyOrphanStock] = useState<"ALL" | "IN_STOCK" | "OUT_OF_STOCK">("ALL")
  const [tyOrphanApproved, setTyOrphanApproved] = useState<"ALL" | "APPROVED" | "UNAPPROVED">("ALL")
  const [tyOrphanSearch, setTyOrphanSearch] = useState("")

  const [dpOrphanSearch, setDpOrphanSearch] = useState("")
  const [dpOrphanBarcode, setDpOrphanBarcode] = useState<"ALL" | "WITH_BARCODE" | "NO_BARCODE">("ALL")

  const [syncingTrendyol, startSyncTrendyol] = useTransition()
  const [uploadingDopigo, startUploadDopigo] = useTransition()
  const [building, startBuild] = useTransition()
  const [bulkApproving, startBulkApprove] = useTransition()
  const [bulkThreshold, setBulkThreshold] = useState("0.85")
  const fileRef = useRef<HTMLInputElement>(null)

  const [exportingBrand, startExportBrand] = useTransition()
  const [importingMatch, startImportMatch] = useTransition()
  const matchFileRef = useRef<HTMLInputElement>(null)

  // Orphan dialog
  const [orphanDialog, setOrphanDialog] = useState<{
    open: boolean
    side: "TRENDYOL" | "DOPIGO"
    barcode: string
    title: string
  } | null>(null)

  function handleSyncTrendyol() {
    startSyncTrendyol(async () => {
      const result = await syncTrendyolListingsAction()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${result.data.totalFetched} ürün çekildi (${(result.data.durationMs / 1000).toFixed(1)}sn)`
      )
      // status'u tazele
      const newStatus = await fetchStatus()
      if (newStatus) setStatus(newStatus)
    })
  }

  function handleDopigoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)
    startUploadDopigo(async () => {
      const result = await importDopigoSnapshotAction(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${result.data.rowCount} satır yüklendi · ${result.data.withBarcode} barkodlu`
      )
      const newStatus = await fetchStatus()
      if (newStatus) setStatus(newStatus)
      if (fileRef.current) fileRef.current.value = ""
    })
  }

  async function fetchStatus(): Promise<SnapshotStatus | null> {
    try {
      const { getSnapshotStatusAction } = await import("./actions")
      return await getSnapshotStatusAction()
    } catch {
      return null
    }
  }

  function handleBuild() {
    startBuild(async () => {
      const result = await buildMatchTableAction({
        brandId: brandId === "_all" ? undefined : Number(brandId),
        includeFuzzy: true,
        fuzzyThreshold: 0.7,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setMatch(result.data)
      toast.success(
        `${result.data.summary.erpTotal} ERP ürünü incelendi · ${result.data.summary.exactMatchPct}% 3-kanal eşleşme`
      )
    })
  }

  async function handleAttach(
    productId: number,
    barcode: string,
    side: "TRENDYOL" | "DOPIGO"
  ) {
    const source: "TRENDYOL_AUDIT" | "DOPIGO_AUDIT" =
      side === "TRENDYOL" ? "TRENDYOL_AUDIT" : "DOPIGO_AUDIT"
    const result = await attachBarcodeAction({ productId, barcode, source })
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Barkod eklendi")
    handleBuild() // tabloyu yenile
  }

  // Toplu fuzzy onay — threshold üstündeki tüm fuzzy match'leri bir kerede ekler
  function handleBulkApprove() {
    if (!match) return
    const threshold = Number(bulkThreshold)
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      toast.error("Geçersiz threshold (0-1 arası)")
      return
    }
    const items: Array<{
      productId: number
      barcode: string
      source: "TRENDYOL_AUDIT" | "DOPIGO_AUDIT"
    }> = []
    for (const r of match.rows) {
      if (!r.erpProductId) continue
      if (
        r.trendyolStatus === "FUZZY" &&
        r.trendyolBarcode &&
        (r.trendyolFuzzyScore ?? 0) >= threshold
      ) {
        items.push({
          productId: r.erpProductId,
          barcode: r.trendyolBarcode,
          source: "TRENDYOL_AUDIT",
        })
      }
      if (
        r.dopigoStatus === "FUZZY" &&
        r.dopigoBarcode &&
        (r.dopigoFuzzyScore ?? 0) >= threshold
      ) {
        items.push({
          productId: r.erpProductId,
          barcode: r.dopigoBarcode,
          source: "DOPIGO_AUDIT",
        })
      }
    }
    if (items.length === 0) {
      toast.info("Threshold üstünde fuzzy eşleşme yok")
      return
    }
    if (
      !confirm(
        `${items.length} fuzzy eşleşmeyi (>%${(threshold * 100).toFixed(0)} güveni olanları) toplu onayla?`
      )
    )
      return
    startBulkApprove(async () => {
      const result = await bulkAttachBarcodesAction(items)
      if (!result.success) {
        toast.error("Toplu onay başarısız")
        return
      }
      toast.success(
        `${result.attached} eşleşme eklendi · ${result.skipped} atlandı`
      )
      handleBuild()
    })
  }

  // Marka bazlı Excel export
  function handleExportBrand() {
    if (brandId === "_all") {
      toast.error("Önce bir marka seçmelisin")
      return
    }
    startExportBrand(async () => {
      const result = await exportBrandProductsExcelAction(Number(brandId))
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
        toast.success(`${result.data.rowCount} ürün indirildi`)
      } catch (err) {
        toast.error(
          "Dosya indirme hatası: " + (err instanceof Error ? err.message : "")
        )
      }
    })
  }

  // Doldurulmuş eşleştirme Excel'ini yükle
  function handleImportMatch(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)
    startImportMatch(async () => {
      const result = await importMatchExcelAction(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const { attached, skipped, errors } = result.data
      toast.success(
        `${attached} barkod eklendi · ${skipped} atlandı${errors.length > 0 ? ` · ${errors.length} hata` : ""}`
      )
      if (matchFileRef.current) matchFileRef.current.value = ""
      handleBuild()
    })
  }

  // Fuzzy stat — toplu onay butonu için
  const fuzzyStats = useMemo(() => {
    if (!match) return { highConf: 0, total: 0 }
    const threshold = Number(bulkThreshold)
    let highConf = 0
    let total = 0
    for (const r of match.rows) {
      if (r.trendyolStatus === "FUZZY") {
        total++
        if ((r.trendyolFuzzyScore ?? 0) >= threshold) highConf++
      }
      if (r.dopigoStatus === "FUZZY") {
        total++
        if ((r.dopigoFuzzyScore ?? 0) >= threshold) highConf++
      }
    }
    return { highConf, total }
  }, [match, bulkThreshold])

  // Filtreleme
  const visibleRows = useMemo(() => {
    if (!match) return []
    if (showOnly === "ALL") return match.rows
    if (showOnly === "MISSING")
      return match.rows.filter(
        (r) => r.trendyolStatus === "MISSING" || r.dopigoStatus === "MISSING"
      )
    if (showOnly === "FUZZY")
      return match.rows.filter(
        (r) => r.trendyolStatus === "FUZZY" || r.dopigoStatus === "FUZZY"
      )
    return [] // orphan ayrı tab
  }, [match, showOnly])

  // Trendyol orphan brand listesi (unique)
  const tyOrphanBrands = useMemo(() => {
    if (!match) return []
    const set = new Map<string, number>()
    for (const o of match.orphansTrendyol) {
      const k = (o.brand ?? "—").trim() || "—"
      set.set(k, (set.get(k) ?? 0) + 1)
    }
    return Array.from(set.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [match])

  // Filtrelenmiş Trendyol orphan
  const filteredTyOrphans = useMemo(() => {
    if (!match) return []
    let list = match.orphansTrendyol
    if (tyOrphanBrand !== "_all") {
      list = list.filter((o) => (o.brand ?? "—") === tyOrphanBrand)
    }
    if (tyOrphanStock === "IN_STOCK") {
      list = list.filter((o) => (o.quantity ?? 0) > 0)
    } else if (tyOrphanStock === "OUT_OF_STOCK") {
      list = list.filter((o) => (o.quantity ?? 0) === 0)
    }
    if (tyOrphanApproved === "APPROVED") {
      list = list.filter((o) => o.approved)
    } else if (tyOrphanApproved === "UNAPPROVED") {
      list = list.filter((o) => !o.approved)
    }
    if (tyOrphanSearch.trim()) {
      const q = tyOrphanSearch.trim().toLocaleLowerCase("tr")
      list = list.filter(
        (o) =>
          o.title.toLocaleLowerCase("tr").includes(q) ||
          o.barcode.includes(q)
      )
    }
    return list
  }, [match, tyOrphanBrand, tyOrphanStock, tyOrphanApproved, tyOrphanSearch])

  // Filtrelenmiş Dopigo orphan
  const filteredDpOrphans = useMemo(() => {
    if (!match) return []
    let list = match.orphansDopigo
    if (dpOrphanBarcode === "WITH_BARCODE") {
      list = list.filter((o) => !!o.barcode)
    } else if (dpOrphanBarcode === "NO_BARCODE") {
      list = list.filter((o) => !o.barcode)
    }
    if (dpOrphanSearch.trim()) {
      const q = dpOrphanSearch.trim().toLocaleLowerCase("tr")
      list = list.filter(
        (o) =>
          o.name.toLocaleLowerCase("tr").includes(q) ||
          (o.barcode ?? "").includes(q) ||
          (o.sku ?? "").toLocaleLowerCase("tr").includes(q) ||
          (o.merchantSku ?? "").toLocaleLowerCase("tr").includes(q)
      )
    }
    return list
  }, [match, dpOrphanBarcode, dpOrphanSearch])

  return (
    <div className="space-y-4">
      {/* Veri Yükleme Kartı */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">1. Veri Hazırla</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SnapshotCard
              title="Trendyol Kataloğu"
              count={status.trendyol.listingCount}
              lastRunAt={status.trendyol.fetchedAt ?? status.trendyol.lastRunAt}
              status={status.trendyol.lastRunStatus}
              actionLabel={
                syncingTrendyol ? "Çekiliyor…" : "Trendyol'dan Çek"
              }
              actionIcon={
                syncingTrendyol ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              onAction={handleSyncTrendyol}
              disabled={syncingTrendyol}
            />
            <SnapshotCard
              title="Dopigo Excel"
              count={status.dopigo.listingCount}
              lastRunAt={status.dopigo.lastRunAt}
              status={status.dopigo.lastRunFilename}
              actionLabel={uploadingDopigo ? "Yükleniyor…" : "Excel Yükle"}
              actionIcon={
                uploadingDopigo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )
              }
              onAction={() => fileRef.current?.click()}
              disabled={uploadingDopigo}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleDopigoUpload}
            />
          </div>
        </CardContent>
      </Card>

      {/* Eşleştirme Yap Kartı */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">2. Eşleştirmeyi Çalıştır</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brand-filter">Marka</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="brand-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Tüm Markalar</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}{" "}
                      <span className="text-xs text-muted-foreground ml-2">
                        {b.productCount} ürün
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleBuild}
                disabled={
                  building ||
                  status.trendyol.listingCount === 0 ||
                  status.dopigo.listingCount === 0
                }
                className="gap-1.5"
              >
                {building ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Eşleştir
              </Button>
            </div>
          </div>
          {(status.trendyol.listingCount === 0 || status.dopigo.listingCount === 0) && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Eşleştirme öncesi her iki kanalın da yüklü olması gerek.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manuel eşleştirme — Excel ile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Alternatif: Excel ile Manuel Eşleştirme
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Marka bazlı ürün listesi indir, Excel'de "Yeni Trendyol Barkod" ve
            "Yeni Dopigo Barkod" kolonlarını doldur, geri yükle. Doldurduğun barkodlar
            ProductBarcode tablosuna alternatif olarak eklenir.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportBrand}
              disabled={exportingBrand || brandId === "_all"}
              className="gap-1.5"
            >
              {exportingBrand ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {brandId === "_all"
                ? "Önce marka seç"
                : "Markanın Ürünlerini İndir"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => matchFileRef.current?.click()}
              disabled={importingMatch}
              className="gap-1.5"
            >
              {importingMatch ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Doldurulmuş Excel'i Yükle
            </Button>
            <input
              ref={matchFileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportMatch}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sonuçlar */}
      {match && (
        <>
          {/* Özet kartları */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="ERP Ürün" value={match.summary.erpTotal} />
            <SummaryCard
              label="3-Kanal Eşleşen"
              value={match.summary.threeChannelMatch}
              tone="success"
            />
            <SummaryCard
              label="Eşleşme Oranı"
              value={`${match.summary.exactMatchPct}%`}
              tone={
                match.summary.exactMatchPct >= 80
                  ? "success"
                  : match.summary.exactMatchPct >= 50
                    ? "warning"
                    : "destructive"
              }
            />
            <SummaryCard
              label="Sadece ERP'de"
              value={match.summary.erpOnly}
              tone="warning"
            />
          </div>

          {/* Tablo + Orphan tab */}
          <Tabs defaultValue="match">
            <TabsList>
              <TabsTrigger value="match">
                Eşleştirme Tablosu
                <Badge variant="secondary" className="ml-2">
                  {match.summary.erpTotal}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="trendyol-orphan">
                Trendyol Orphan
                <Badge variant="secondary" className="ml-2">
                  {match.summary.trendyolOrphan}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="dopigo-orphan">
                Dopigo Orphan
                <Badge variant="secondary" className="ml-2">
                  {match.summary.dopigoOrphan}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="match" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={showOnly === "ALL"}
                    onClick={() => setShowOnly("ALL")}
                    label={`Tümü (${match.rows.length})`}
                  />
                  <FilterChip
                    active={showOnly === "MISSING"}
                    onClick={() => setShowOnly("MISSING")}
                    label="Sadece eksikler"
                  />
                  <FilterChip
                    active={showOnly === "FUZZY"}
                    onClick={() => setShowOnly("FUZZY")}
                    label={`Sadece fuzzy (${fuzzyStats.total})`}
                  />
                </div>

                {/* Toplu onay paneli */}
                {fuzzyStats.total > 0 && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
                    <Label className="text-xs whitespace-nowrap">
                      Eşik:
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={bulkThreshold}
                      onChange={(e) => setBulkThreshold(e.target.value)}
                      className="h-7 w-16 text-xs tabular-nums"
                    />
                    <Button
                      size="sm"
                      onClick={handleBulkApprove}
                      disabled={bulkApproving || fuzzyStats.highConf === 0}
                      className="gap-1.5 h-7"
                    >
                      {bulkApproving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Toplu Onayla ({fuzzyStats.highConf})
                    </Button>
                  </div>
                )}
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="rounded-md border max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                          <TableHead className="min-w-[260px]">ERP Ürün</TableHead>
                          <TableHead>Marka</TableHead>
                          <TableHead className="text-right">Stok</TableHead>
                          <TableHead className="min-w-[200px]">Trendyol</TableHead>
                          <TableHead className="min-w-[200px]">Dopigo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.slice(0, 500).map((r) => (
                          <TableRow key={r.erpProductId ?? r.erpBarcode}>
                            <TableCell className="text-sm">
                              <div
                                className="truncate max-w-[300px]"
                                title={r.erpName ?? ""}
                              >
                                {r.erpName}
                              </div>
                              <div className="text-xs text-muted-foreground tabular-nums">
                                {r.erpBarcode}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {r.erpBrand ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.erpMainStock ?? 0}
                            </TableCell>
                            <ChannelCell
                              status={r.trendyolStatus}
                              fuzzyScore={r.trendyolFuzzyScore}
                              barcode={r.trendyolBarcode}
                              text={r.trendyolTitle}
                              extra={
                                r.trendyolApproved != null
                                  ? r.trendyolApproved
                                    ? "Onaylı"
                                    : "Onaysız"
                                  : null
                              }
                              onConfirm={
                                r.trendyolStatus === "FUZZY" && r.erpProductId
                                  ? () =>
                                      handleAttach(
                                        r.erpProductId!,
                                        r.trendyolBarcode!,
                                        "TRENDYOL"
                                      )
                                  : undefined
                              }
                            />
                            <ChannelCell
                              status={r.dopigoStatus}
                              fuzzyScore={r.dopigoFuzzyScore}
                              barcode={r.dopigoBarcode}
                              text={r.dopigoName}
                              extra={r.dopigoSku ?? null}
                              onConfirm={
                                r.dopigoStatus === "FUZZY" &&
                                r.erpProductId &&
                                r.dopigoBarcode
                                  ? () =>
                                      handleAttach(
                                        r.erpProductId!,
                                        r.dopigoBarcode!,
                                        "DOPIGO"
                                      )
                                  : undefined
                              }
                            />
                          </TableRow>
                        ))}
                        {visibleRows.length > 500 && (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-xs text-muted-foreground py-3"
                            >
                              İlk 500 satır gösteriliyor — toplam {visibleRows.length}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trendyol-orphan" className="space-y-3">
              {/* Filtre toolbar */}
              <Card>
                <CardContent className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Marka</Label>
                      <Select value={tyOrphanBrand} onValueChange={setTyOrphanBrand}>
                        <SelectTrigger size="sm" className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Tüm Markalar ({match.orphansTrendyol.length})</SelectItem>
                          {tyOrphanBrands.map((b) => (
                            <SelectItem key={b.name} value={b.name}>
                              {b.name} <span className="text-xs text-muted-foreground ml-1">({b.count})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Stok</Label>
                      <Select
                        value={tyOrphanStock}
                        onValueChange={(v) => setTyOrphanStock(v as typeof tyOrphanStock)}
                      >
                        <SelectTrigger size="sm" className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Tümü</SelectItem>
                          <SelectItem value="IN_STOCK">Stok &gt; 0</SelectItem>
                          <SelectItem value="OUT_OF_STOCK">Stok = 0</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Onay Durumu</Label>
                      <Select
                        value={tyOrphanApproved}
                        onValueChange={(v) => setTyOrphanApproved(v as typeof tyOrphanApproved)}
                      >
                        <SelectTrigger size="sm" className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Tümü</SelectItem>
                          <SelectItem value="APPROVED">Sadece onaylı</SelectItem>
                          <SelectItem value="UNAPPROVED">Sadece onaysız</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ara (başlık / barkod)</Label>
                      <Input
                        value={tyOrphanSearch}
                        onChange={(e) => setTyOrphanSearch(e.target.value)}
                        placeholder="Phloretin..."
                        size="sm"
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{filteredTyOrphans.length}</span> /{" "}
                      {match.orphansTrendyol.length} ürün gösteriliyor
                    </span>
                    {(tyOrphanBrand !== "_all" ||
                      tyOrphanStock !== "ALL" ||
                      tyOrphanApproved !== "ALL" ||
                      tyOrphanSearch) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setTyOrphanBrand("_all")
                          setTyOrphanStock("ALL")
                          setTyOrphanApproved("ALL")
                          setTyOrphanSearch("")
                        }}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Filtreleri temizle
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  <div className="rounded-md border max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                          <TableHead>Trendyol Barkod</TableHead>
                          <TableHead className="min-w-[280px]">Başlık</TableHead>
                          <TableHead>Marka</TableHead>
                          <TableHead className="text-right tabular-nums">Stok</TableHead>
                          <TableHead className="text-right tabular-nums">Fiyat</TableHead>
                          <TableHead>Onay</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTyOrphans.slice(0, 300).map((o) => (
                          <TableRow key={o.barcode}>
                            <TableCell className="text-xs tabular-nums">
                              {o.barcode}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div
                                className="truncate max-w-[400px]"
                                title={o.title}
                              >
                                {o.title}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {o.brand ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span
                                className={
                                  (o.quantity ?? 0) === 0
                                    ? "text-destructive"
                                    : ""
                                }
                              >
                                {o.quantity ?? 0}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {o.salePrice != null ? `₺${o.salePrice.toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell>
                              {o.approved ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-green-500/40 text-green-700 dark:text-green-400"
                                >
                                  ✓
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400"
                                >
                                  bekliyor
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() =>
                                  setOrphanDialog({
                                    open: true,
                                    side: "TRENDYOL",
                                    barcode: o.barcode,
                                    title: o.title,
                                  })
                                }
                              >
                                <Link2 className="h-3 w-3" />
                                ERP ile eşle
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredTyOrphans.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center text-xs text-muted-foreground py-6"
                            >
                              {match.orphansTrendyol.length === 0
                                ? "Trendyol'da orphan kalmadı."
                                : "Filtreye uyan orphan yok."}
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredTyOrphans.length > 300 && (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center text-xs text-muted-foreground py-3"
                            >
                              İlk 300 satır gösteriliyor — toplam {filteredTyOrphans.length}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dopigo-orphan" className="space-y-3">
              {/* Filtre toolbar */}
              <Card>
                <CardContent className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Barkod Durumu</Label>
                      <Select
                        value={dpOrphanBarcode}
                        onValueChange={(v) => setDpOrphanBarcode(v as typeof dpOrphanBarcode)}
                      >
                        <SelectTrigger size="sm" className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Tümü</SelectItem>
                          <SelectItem value="WITH_BARCODE">Sadece barkodlu</SelectItem>
                          <SelectItem value="NO_BARCODE">Sadece barkodsuz</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ara (isim / barkod / sku)</Label>
                      <Input
                        value={dpOrphanSearch}
                        onChange={(e) => setDpOrphanSearch(e.target.value)}
                        placeholder="Caudalie / Vinopure / 8691..."
                        size="sm"
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{filteredDpOrphans.length}</span> /{" "}
                      {match.orphansDopigo.length} ürün gösteriliyor
                    </span>
                    {(dpOrphanBarcode !== "ALL" || dpOrphanSearch) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setDpOrphanBarcode("ALL")
                          setDpOrphanSearch("")
                        }}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Filtreleri temizle
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  <div className="rounded-md border max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                          <TableHead>Dopigo Barkod</TableHead>
                          <TableHead className="min-w-[280px]">İsim</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDpOrphans.slice(0, 300).map((o, i) => (
                          <TableRow key={`${o.barcode ?? "_"}-${i}`}>
                            <TableCell className="text-xs tabular-nums">
                              {o.barcode ?? (
                                <span className="text-muted-foreground">yok</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div
                                className="truncate max-w-[400px]"
                                title={o.name}
                              >
                                {o.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {o.sku ?? o.merchantSku ?? "—"}
                            </TableCell>
                            <TableCell>
                              {o.barcode ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() =>
                                    setOrphanDialog({
                                      open: true,
                                      side: "DOPIGO",
                                      barcode: o.barcode!,
                                      title: o.name,
                                    })
                                  }
                                >
                                  <Link2 className="h-3 w-3" />
                                  ERP ile eşle
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Barkodsuz
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredDpOrphans.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center text-xs text-muted-foreground py-6"
                            >
                              {match.orphansDopigo.length === 0
                                ? "Dopigo'da orphan kalmadı."
                                : "Filtreye uyan orphan yok."}
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredDpOrphans.length > 300 && (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center text-xs text-muted-foreground py-3"
                            >
                              İlk 300 satır gösteriliyor — toplam {filteredDpOrphans.length}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Orphan eşleştirme dialog */}
      {orphanDialog && (
        <OrphanMatchDialog
          open={orphanDialog.open}
          side={orphanDialog.side}
          barcode={orphanDialog.barcode}
          title={orphanDialog.title}
          onClose={() => setOrphanDialog(null)}
          onMatched={() => {
            setOrphanDialog(null)
            handleBuild()
          }}
        />
      )}
    </div>
  )
}

// ====================== Yardımcı bileşenler ======================

function SnapshotCard({
  title,
  count,
  lastRunAt,
  status,
  actionLabel,
  actionIcon,
  onAction,
  disabled,
}: {
  title: string
  count: number
  lastRunAt: Date | null
  status: string | null
  actionLabel: string
  actionIcon: React.ReactNode
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <div className="rounded-lg border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="text-2xl font-bold tabular-nums">{count}</div>
          {lastRunAt && (
            <div className="text-[10px] text-muted-foreground mt-1">
              {new Date(lastRunAt).toLocaleString("tr-TR")}
            </div>
          )}
          {status && (
            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
              {status}
            </div>
          )}
        </div>
        <Button size="sm" onClick={onAction} disabled={disabled} className="gap-1.5">
          {actionIcon}
          <span className="hidden sm:inline">{actionLabel}</span>
        </Button>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: "success" | "warning" | "destructive"
}) {
  const cls =
    tone === "success"
      ? "text-green-700 dark:text-green-400"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "destructive"
          ? "text-destructive"
          : ""
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Badge
      variant="outline"
      className={
        "h-7 px-2 text-xs cursor-pointer select-none transition-colors " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted")
      }
      onClick={onClick}
    >
      {label}
    </Badge>
  )
}

function ChannelCell({
  status,
  fuzzyScore,
  barcode,
  text,
  extra,
  onConfirm,
}: {
  status: "EXACT" | "FUZZY" | "MISSING"
  fuzzyScore?: number
  barcode: string | null
  text: string | null
  extra: string | null
  onConfirm?: () => void
}) {
  if (status === "MISSING") {
    return (
      <TableCell>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Eşleşme yok
        </span>
      </TableCell>
    )
  }
  return (
    <TableCell>
      <div className="text-sm flex items-center gap-1.5">
        {status === "EXACT" ? (
          <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
          >
            FUZZY {fuzzyScore != null ? `${(fuzzyScore * 100).toFixed(0)}%` : ""}
          </Badge>
        )}
        <div className="truncate max-w-[200px]" title={text ?? ""}>
          {text}
        </div>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums flex items-center gap-2">
        <span>{barcode}</span>
        {extra && <span>· {extra}</span>}
      </div>
      {onConfirm && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 mt-1 px-2 text-xs gap-1"
          onClick={onConfirm}
        >
          <CheckCircle2 className="h-3 w-3" />
          Doğru — onayla
        </Button>
      )}
    </TableCell>
  )
}

function OrphanMatchDialog({
  open,
  side,
  barcode,
  title,
  onClose,
  onMatched,
}: {
  open: boolean
  side: "TRENDYOL" | "DOPIGO"
  barcode: string
  title: string
  onClose: () => void
  onMatched: () => void
}) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<
    Array<{ id: number; name: string; primaryBarcode: string; brandName: string | null }>
  >([])
  const [searching, startSearch] = useTransition()
  const [attaching, startAttach] = useTransition()

  function handleSearch() {
    if (search.trim().length < 2) return
    startSearch(async () => {
      const list = await searchProductsForOrphanAction(search)
      setResults(list)
    })
  }

  function handlePick(productId: number) {
    startAttach(async () => {
      const source: "TRENDYOL_AUDIT" | "DOPIGO_AUDIT" =
        side === "TRENDYOL" ? "TRENDYOL_AUDIT" : "DOPIGO_AUDIT"
      const result = await attachBarcodeAction({ productId, barcode, source })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Eşleştirme yapıldı")
      onMatched()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {side === "TRENDYOL" ? "Trendyol" : "Dopigo"} ürününü ERP ile eşle
          </DialogTitle>
          <DialogDescription>
            <div className="font-mono text-xs">{barcode}</div>
            <div className="text-sm">{title}</div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="orphan-search">ERP'den ürün ara (ad veya barkod)</Label>
            <div className="flex gap-2">
              <Input
                id="orphan-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Caudalie / Vinopure / 8691..."
                autoFocus
              />
              <Button onClick={handleSearch} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ara"}
              </Button>
            </div>
          </div>

          {results.length > 0 && (
            <div className="rounded-md border max-h-72 overflow-y-auto divide-y">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePick(p.id)}
                  disabled={attaching}
                  className="w-full text-left p-3 hover:bg-muted transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {p.primaryBarcode} · {p.brandName ?? "—"}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {results.length === 0 && search && !searching && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Sonuç bulunamadı.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={attaching}>
            Vazgeç
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
