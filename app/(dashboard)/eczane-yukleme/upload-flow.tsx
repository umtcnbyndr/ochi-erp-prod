"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Link2,
  Plus,
  SkipForward,
  Search,
  X,
  Filter,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  analyzePharmacyFileAction,
  reanalyzePharmacyAction,
  executePharmacyUploadAction,
  searchProductsForLinkAction,
  type ProductSearchResult,
} from "./actions"
import type {
  PharmacyColumnMapping,
  PharmacyPreview,
  PharmacyImportResult,
  UserDecisions,
} from "@/lib/services/pharmacy-upload"

const FIELD_LABELS: Array<{ key: keyof PharmacyColumnMapping; label: string; required?: boolean }> = [
  { key: "barcode", label: "Barkod", required: true },
  { key: "name", label: "Ürün Adı", required: true },
  { key: "brandName", label: "Marka", required: true },
  { key: "categoryName", label: "Kategori", required: true },
  { key: "productCode", label: "Ürün Kodu" },
  { key: "vatRate", label: "KDV" },
  { key: "streetPurchasePrice", label: "Eczane Alış Fiyatı" },
  { key: "psf", label: "Eczane PSF Fiyatı" },
  { key: "streetStock", label: "Eczane Stok" },
]

type Loaded = {
  rows: Record<string, unknown>[]
  filename: string
  preview: PharmacyPreview
}

export function PharmacyUploadFlow() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [decisions, setDecisions] = useState<UserDecisions>({})
  const [result, setResult] = useState<PharmacyImportResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [linkTarget, setLinkTarget] = useState<number | null>(null) // rowNumber

  const onUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await analyzePharmacyFileAction(formData)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setLoaded(r.data)
      // default decisions: "update" for update-kind, "skip" for others
      const def: UserDecisions = {}
      for (const row of r.data.preview.rows) {
        if (row.decision.kind === "update") def[row.rowNumber] = { action: "update" }
      }
      setDecisions(def)
      setStep(2)
    })
  }

  const onMappingChange = (key: keyof PharmacyColumnMapping, value: string) => {
    if (!loaded) return
    const next = { ...loaded.preview.mapping, [key]: value === "_none" ? undefined : value }
    startTransition(async () => {
      const r = await reanalyzePharmacyAction(loaded.rows, next)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      const def: UserDecisions = {}
      for (const row of r.data.rows) {
        if (row.decision.kind === "update") def[row.rowNumber] = { action: "update" }
      }
      setLoaded({ ...loaded, preview: r.data })
      setDecisions(def)
    })
  }

  const setDecision = (rowNumber: number, action: UserDecisions[number]) => {
    setDecisions((d) => ({ ...d, [rowNumber]: action }))
  }

  const onExecute = () => {
    if (!loaded) return
    startTransition(async () => {
      const r = await executePharmacyUploadAction(loaded.filename, loaded.preview, decisions)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setResult(r.data)
      setStep(3)
      toast.success(
        `${r.data.updated} güncellendi, ${r.data.created} oluşturuldu, ${r.data.linked} bağlandı`
      )
    })
  }

  const canExecute = Boolean(
    loaded?.preview.mapping.barcode &&
      loaded?.preview.mapping.name &&
      loaded?.preview.mapping.brandName &&
      loaded?.preview.mapping.categoryName
  )

  const unknownRows = useMemo(
    () => loaded?.preview.rows.filter((r) => r.decision.kind === "unknown") ?? [],
    [loaded]
  )
  const conflictRows = useMemo(
    () => loaded?.preview.rows.filter((r) => r.decision.kind === "conflict") ?? [],
    [loaded]
  )
  const updateRows = useMemo(
    () => loaded?.preview.rows.filter((r) => r.decision.kind === "update") ?? [],
    [loaded]
  )
  const errorRows = useMemo(
    () => loaded?.preview.rows.filter((r) => r.decision.kind === "error") ?? [],
    [loaded]
  )
  const psfWarningRows = useMemo(
    () => loaded?.preview.rows.filter((r) => r.psfWarning != null) ?? [],
    [loaded]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <StepBadge num={1} active={step === 1} done={step > 1} label="Yükle" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <StepBadge num={2} active={step === 2} done={step > 2} label="Eşleştir ve Karar Ver" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <StepBadge num={3} active={step === 3} done={false} label="Sonuç" />
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dosya Yükle</CardTitle>
            <CardDescription>
              Eczane Excel&apos;i: Barkod, Ürün Kodu, Ürün Adı, KDV, Eczane Alış Fiyatı, Eczane PSF,
              Eczane Stok, Kategori, Marka kolonları beklenir. Ana depo stok/fiyatına dokunulmaz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUpload} className="space-y-4">
              <Input type="file" name="file" accept=".xlsx,.xls,.csv" required disabled={pending} />
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Yükle ve Analiz Et
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && loaded && (
        <div className="space-y-6">
          {/* Mapping + Summary */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Kolon Eşleştirme</CardTitle>
                <CardDescription>
                  Sistem alanlarını Excel kolonlarına eşle. Otomatik tahmin yapıldı, gerekirse düzelt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {FIELD_LABELS.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={loaded.preview.mapping[f.key] ?? "_none"}
                      onValueChange={(v) => onMappingChange(f.key, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Eşleşme yok" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Eşleşme yok —</SelectItem>
                        {loaded.preview.columns.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Özet</CardTitle>
                  <CardDescription>
                    Toplam {loaded.preview.totalRows} satır. Sadece cadde stok / alış / PSF güncellenir.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <StatBox label="Güncellenecek" value={loaded.preview.stats.willUpdate} color="success" />
                    <StatBox
                      label="Bilinmeyen (karar gerekli)"
                      value={loaded.preview.stats.unknown}
                      color="warning"
                    />
                    <StatBox
                      label="Çakışma (atlanacak)"
                      value={loaded.preview.stats.conflicts}
                      color="destructive"
                    />
                    <StatBox label="Hata" value={loaded.preview.stats.errors} color="destructive" />
                  </div>
                  {loaded.preview.stats.duplicatesInFile > 0 && (
                    <p className="mt-3 text-xs text-warning">
                      <AlertTriangle className="inline h-3 w-3" />{" "}
                      {loaded.preview.stats.duplicatesInFile} satır aynı barkodla tekrarlanıyor — 1.
                      kullanılır, diğerleri atlanır.
                    </p>
                  )}
                  {loaded.preview.stats.psfWarnings > 0 && (
                    <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      <p className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {loaded.preview.stats.psfWarnings} satırda PSF uyumsuzluğu
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {loaded.preview.psfThreshold &&
                        loaded.preview.psfThreshold.sampleSize >= 10 ? (
                          <>
                            Mevcut {loaded.preview.psfThreshold.sampleSize} ürünün
                            ortalama alış/PSF oranı{" "}
                            <strong>
                              %
                              {(
                                loaded.preview.psfThreshold.median * 100
                              ).toFixed(0)}
                            </strong>
                            . Bu değerin %30'u olan{" "}
                            <strong>
                              %
                              {(
                                loaded.preview.psfThreshold.threshold * 100
                              ).toFixed(0)}
                            </strong>
                            'in altındaki ürünler işaretlendi.
                          </>
                        ) : (
                          <>
                            Alış fiyatı PSF&apos;nin %10&apos;undan düşük (yetersiz
                            veri için varsayılan eşik).
                          </>
                        )}{" "}
                        Tablodaki sarı ⚠️ işareti olan satırları kontrol et.
                      </p>
                    </div>
                  )}
                  {(loaded.preview.newBrands.length > 0 ||
                    loaded.preview.newCategories.length > 0) && (
                    <div className="mt-3 space-y-2">
                      {loaded.preview.newBrands.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Yeni markalar ({loaded.preview.newBrands.length}):
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {loaded.preview.newBrands.map((b) => (
                              <Badge key={b} variant="secondary">
                                {b}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {loaded.preview.newCategories.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Yeni kategoriler ({loaded.preview.newCategories.length}):
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {loaded.preview.newCategories.map((c) => (
                              <Badge key={c} variant="secondary">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Geri
                </Button>
                <Button onClick={onExecute} disabled={pending || !canExecute}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Yüklemeyi Uygula
                </Button>
              </div>
            </div>
          </div>

          {/* Unknown rows - user decision */}
          {unknownRows.length > 0 && (
            <UnknownRowsCard
              rows={unknownRows}
              decisions={decisions}
              onSetDecision={setDecision}
              onBulkSet={(rowNumbers, action) => {
                setDecisions((d) => {
                  const next = { ...d }
                  for (const n of rowNumbers) next[n] = action
                  return next
                })
              }}
              onOpenLink={(rowNumber) => setLinkTarget(rowNumber)}
            />
          )}

          {/* Conflict rows */}
          {conflictRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Çakışmalar ({conflictRows.length}) — atlanacak
                </CardTitle>
                <CardDescription>
                  Bu barkodlar sistemde farklı bir ürüne bağlı. Otomatik atlanacak. Kontrol edip manuel
                  düzeltmen gerekebilir.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Satır</TableHead>
                        <TableHead>Barkod</TableHead>
                        <TableHead>Excel&apos;deki İsim</TableHead>
                        <TableHead>Sistemdeki İsim</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conflictRows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.rowNumber}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.barcode}</TableCell>
                          <TableCell className="text-xs">{row.name}</TableCell>
                          <TableCell className="text-xs">
                            {row.decision.kind === "conflict" ? row.decision.existingName : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Errors */}
          {errorRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <X className="h-5 w-5" />
                  Hatalı Satırlar ({errorRows.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs">
                  {errorRows.slice(0, 30).map((r) => (
                    <li key={r.rowNumber} className="text-destructive">
                      Satır {r.rowNumber}:{" "}
                      {r.decision.kind === "error" ? r.decision.message : "—"}
                    </li>
                  ))}
                  {errorRows.length > 30 && (
                    <li className="text-muted-foreground">
                      ... ve {errorRows.length - 30} tane daha
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* PSF uyarılı satırlar — alış orantısız düşük */}
          {psfWarningRows.length > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  PSF Uyarısı Olan Satırlar ({psfWarningRows.length})
                </CardTitle>
                <CardDescription>
                  Alış fiyatı PSF'nin %10'undan düşük — Excel kolon eşleşmesi veya satırdaki
                  veri hatalı olabilir. Yine de yükleme yapabilirsin ama önce kontrol et.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Satır</TableHead>
                        <TableHead>Barkod</TableHead>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="text-right">Alış</TableHead>
                        <TableHead className="text-right">PSF</TableHead>
                        <TableHead className="text-right">Oran</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {psfWarningRows.slice(0, 50).map((row) => {
                        const ratio =
                          row.streetPurchasePrice && row.psf
                            ? (row.streetPurchasePrice / row.psf) * 100
                            : null
                        return (
                          <TableRow key={row.rowNumber}>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.rowNumber}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.barcode}</TableCell>
                            <TableCell className="text-xs max-w-[280px]">
                              <div className="truncate" title={row.name}>{row.name}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {row.streetPurchasePrice != null
                                ? `₺${row.streetPurchasePrice.toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {row.psf != null ? `₺${row.psf.toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs text-amber-700 dark:text-amber-400">
                              {ratio != null ? `%${ratio.toFixed(1)}` : "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {psfWarningRows.length > 50 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                            ... ve {psfWarningRows.length - 50} tane daha
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Update rows preview (collapsed) */}
          {updateRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-success">
                  Güncellenecek Ürünler ({updateRows.length})
                </CardTitle>
                <CardDescription>
                  Bu ürünler zaten sistemde. Sadece cadde stok, alış ve PSF güncellenecek.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Barkod</TableHead>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="text-right">Stok</TableHead>
                        <TableHead className="text-right">Alış</TableHead>
                        <TableHead className="text-right">PSF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {updateRows.slice(0, 50).map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell className="font-mono text-xs">{row.barcode}</TableCell>
                          <TableCell className="text-xs">{row.name}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {row.streetStock}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {row.streetPurchasePrice != null ? row.streetPurchasePrice.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {row.psf != null ? row.psf.toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {updateRows.length > 50 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                            ... ve {updateRows.length - 50} tane daha
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === 3 && result && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div>
                <CardTitle>Yükleme Tamamlandı</CardTitle>
                <CardDescription>{result.total} satır işlendi</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatBox label="Güncellendi" value={result.updated} color="success" />
              <StatBox label="Yeni" value={result.created} color="success" />
              <StatBox label="Bağlandı" value={result.linked} color="success" />
              <StatBox label="Atlandı" value={result.skipped + result.conflicts} />
              <StatBox label="Hata" value={result.errors.length} color="destructive" />
            </div>
            {result.newBrands.length > 0 && (
              <div>
                <p className="text-sm font-medium">Yeni markalar:</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.newBrands.map((b) => (
                    <Badge key={b} variant="secondary">
                      {b}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {result.newCategories.length > 0 && (
              <div>
                <p className="text-sm font-medium">Yeni kategoriler:</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.newCategories.map((c) => (
                    <Badge key={c} variant="secondary">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {result.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium">Hatalar:</p>
                <ul className="mt-1 space-y-1 text-xs text-destructive">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Satır {e.rowNumber}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1)
                  setLoaded(null)
                  setResult(null)
                  setDecisions({})
                }}
              >
                Yeni Yükleme
              </Button>
              <Button asChild>
                <Link href="/urunler">Ürünlere Git</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link modal */}
      {linkTarget != null && loaded && (
        <LinkProductDialog
          row={loaded.preview.rows.find((r) => r.rowNumber === linkTarget)!}
          onClose={() => setLinkTarget(null)}
          onSelect={(productId) => {
            setDecision(linkTarget, { action: "link", productId })
            setLinkTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------- Unknown Rows Card (with bulk actions + filters) ----------------

type AnalyzedRowUI = PharmacyPreview["rows"][number]

function UnknownRowsCard({
  rows,
  decisions,
  onSetDecision,
  onBulkSet,
  onOpenLink,
}: {
  rows: AnalyzedRowUI[]
  decisions: UserDecisions
  onSetDecision: (rowNumber: number, action: UserDecisions[number]) => void
  onBulkSet: (rowNumbers: number[], action: UserDecisions[number]) => void
  onOpenLink: (rowNumber: number) => void
}) {
  const [query, setQuery] = useState("")
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<"all" | "create" | "skip" | "link" | "undecided">(
    "all"
  )
  const [pageSize, setPageSize] = useState(50)
  // Stok sıralama: null = orijinal sıra, "desc" = büyükten küçüğe, "asc" = küçükten büyüğe
  const [stockSort, setStockSort] = useState<null | "desc" | "asc">(null)
  function toggleStockSort() {
    setStockSort((s) => (s === null ? "desc" : s === "desc" ? "asc" : null))
  }

  // Markaları topla (sayılarıyla)
  const brandCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) {
      const b = r.brandName ?? "—"
      map.set(b, (map.get(b) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])

  // Filtrelenmiş satırlar
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr")
    return rows.filter((r) => {
      if (brandFilter != null && (r.brandName ?? "—") !== brandFilter) return false
      if (actionFilter !== "all") {
        const dec = decisions[r.rowNumber]
        if (actionFilter === "undecided") {
          if (dec) return false
        } else if (actionFilter === "link") {
          if (dec?.action !== "link") return false
        } else {
          if (dec?.action !== actionFilter) return false
        }
      }
      if (q === "") return true
      return (
        r.barcode.toLocaleLowerCase("tr").includes(q) ||
        r.name.toLocaleLowerCase("tr").includes(q) ||
        (r.brandName ?? "").toLocaleLowerCase("tr").includes(q) ||
        (r.productCode ?? "").toLocaleLowerCase("tr").includes(q)
      )
    })
  }, [rows, query, brandFilter, actionFilter, decisions])

  // Kararlara göre sayımlar
  const counts = useMemo(() => {
    let create = 0
    let link = 0
    let skip = 0
    let undecided = 0
    for (const r of rows) {
      const dec = decisions[r.rowNumber]
      if (!dec) undecided++
      else if (dec.action === "create") create++
      else if (dec.action === "link") link++
      else if (dec.action === "skip") skip++
    }
    return { create, link, skip, undecided }
  }, [rows, decisions])

  // Stok sıralaması (filtre sonrası uygulanır)
  const sorted = useMemo(() => {
    if (stockSort === null) return filtered
    const dir = stockSort === "desc" ? -1 : 1
    return [...filtered].sort((a, b) => (a.streetStock - b.streetStock) * dir)
  }, [filtered, stockSort])

  const visible = sorted.slice(0, pageSize)
  const filteredNumbers = sorted.map((r) => r.rowNumber)

  const clearFilters = () => {
    setQuery("")
    setBrandFilter(null)
    setActionFilter("all")
  }

  const hasFilters = query !== "" || brandFilter != null || actionFilter !== "all"

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Bilinmeyen Ürünler ({rows.length})
            </CardTitle>
            <CardDescription>
              Sistemde bulunmayan barkodlar. Her biri için karar ver. Markaya göre toplu aksiyon
              kullanabilirsin.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              <Plus className="h-3 w-3 text-success" /> Yeni: {counts.create}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Link2 className="h-3 w-3 text-primary" /> Bağlı: {counts.link}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <SkipForward className="h-3 w-3 text-muted-foreground" /> Atla: {counts.skip}
            </Badge>
            {counts.undecided > 0 && (
              <Badge variant="destructive" className="gap-1">
                Karar bekliyor: {counts.undecided}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Bulk actions toolbar */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              Filtrelenmiş {filtered.length} satır için toplu aksiyon:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={filtered.length === 0}
              onClick={() => onBulkSet(filteredNumbers, { action: "create" })}
            >
              <Plus className="h-3 w-3" />
              Hepsini Yeni Ekle ({filtered.length})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={filtered.length === 0}
              onClick={() => onBulkSet(filteredNumbers, { action: "skip" })}
            >
              <SkipForward className="h-3 w-3" />
              Hepsini Atla
            </Button>
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="h-3 w-3" />
                Filtreleri Temizle
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Barkod, isim, marka, kod ara..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
          <Select
            value={actionFilter}
            onValueChange={(v) => setActionFilter(v as typeof actionFilter)}
          >
            <SelectTrigger className="h-9 w-[160px] text-xs">
              <Filter className="h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Satırlar</SelectItem>
              <SelectItem value="undecided">Karar Verilmemiş</SelectItem>
              <SelectItem value="create">Yeni Olarak İşaretli</SelectItem>
              <SelectItem value="link">Bağlanmış</SelectItem>
              <SelectItem value="skip">Atlanacak</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Brand chips */}
        {brandCounts.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={brandFilter == null ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/10"
              onClick={() => setBrandFilter(null)}
            >
              Tümü ({rows.length})
            </Badge>
            {brandCounts.map(([brand, count]) => (
              <Badge
                key={brand}
                variant={brandFilter === brand ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => setBrandFilter(brandFilter === brand ? null : brand)}
              >
                {brand} ({count})
              </Badge>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Satır</TableHead>
                <TableHead>Barkod</TableHead>
                <TableHead>Ürün Adı</TableHead>
                <TableHead>Marka</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={toggleStockSort}
                    className={`inline-flex items-center gap-0.5 hover:text-foreground transition-colors ${stockSort !== null ? "text-foreground font-semibold" : ""}`}
                    title="Stok sıralaması"
                  >
                    Stok
                    {stockSort === "desc" && <span className="text-[10px]">↓</span>}
                    {stockSort === "asc" && <span className="text-[10px]">↑</span>}
                    {stockSort === null && <span className="text-[10px] opacity-40">↕</span>}
                  </button>
                </TableHead>
                <TableHead className="text-right">Alış</TableHead>
                <TableHead>Karar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-6 text-center text-xs text-muted-foreground">
                    Filtreye uyan satır yok
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((row) => {
                  const dec = decisions[row.rowNumber]
                  const action = dec?.action
                  const linkedProductId = dec?.action === "link" ? dec.productId : null
                  return (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.rowNumber}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.barcode}</TableCell>
                      <TableCell className="text-xs">{row.name}</TableCell>
                      <TableCell className="text-xs">{row.brandName ?? "—"}</TableCell>
                      <TableCell className="text-xs">{row.categoryName ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {row.streetStock}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {row.streetPurchasePrice != null
                          ? row.streetPurchasePrice.toFixed(2)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant={action === "create" ? "default" : "outline"}
                            onClick={() =>
                              onSetDecision(row.rowNumber, { action: "create" })
                            }
                          >
                            <Plus className="h-3 w-3" />
                            Yeni
                          </Button>
                          <Button
                            size="sm"
                            variant={action === "link" ? "default" : "outline"}
                            onClick={() => onOpenLink(row.rowNumber)}
                          >
                            <Link2 className="h-3 w-3" />
                            {linkedProductId ? `Bağlı (#${linkedProductId})` : "Bağla"}
                          </Button>
                          <Button
                            size="sm"
                            variant={action === "skip" ? "secondary" : "ghost"}
                            onClick={() => onSetDecision(row.rowNumber, { action: "skip" })}
                          >
                            <SkipForward className="h-3 w-3" />
                            Atla
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination hint */}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {visible.length} / {filtered.length} satır gösteriliyor
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPageSize((s) => s + 100)}
            >
              Daha fazla yükle (+100)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------- Link Dialog ----------------

function LinkProductDialog({
  row,
  onClose,
  onSelect,
}: {
  row: { rowNumber: number; barcode: string; name: string }
  onClose: () => void
  onSelect: (productId: number) => void
}) {
  const [query, setQuery] = useState(row.name)
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const r = await searchProductsForLinkAction(q)
    setResults(r)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void search(query)
    }, 300)
    return () => clearTimeout(t)
  }, [query, search])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mevcut Ürüne Bağla</DialogTitle>
          <DialogDescription>
            Excel satırı: <span className="font-mono">{row.barcode}</span> — {row.name}
            <br />
            Bu barkodu bağlamak istediğin mevcut ürünü ara ve seç.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Ürün adı, barkod veya kod ara..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-96 overflow-auto rounded-lg border">
            {loading ? (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {query.trim().length < 2 ? "En az 2 karakter gir" : "Eşleşme yok"}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Marka</TableHead>
                    <TableHead>Barkod</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.brandName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.primaryBarcode}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => onSelect(p.id)}>
                          Seç
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- Helpers ----------------

function StepBadge({
  num,
  active,
  done,
  label,
}: {
  num: number
  active: boolean
  done: boolean
  label: string
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        active ? "text-foreground font-medium" : done ? "text-success" : "text-muted-foreground"
      }`}
    >
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
          done
            ? "bg-success text-white"
            : active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : num}
      </div>
      <span className="hidden sm:inline">{label}</span>
    </div>
  )
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: "success" | "warning" | "destructive"
}) {
  const colorClass =
    color === "success"
      ? "text-success"
      : color === "warning"
      ? "text-warning"
      : color === "destructive"
      ? "text-destructive"
      : ""
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  )
}
