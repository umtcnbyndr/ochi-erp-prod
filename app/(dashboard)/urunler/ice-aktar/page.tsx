"use client"
import { useState, useTransition } from "react"
import Link from "next/link"
import { Upload, CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/common/page-header"
import { analyzeFileAction, reanalyzeAction, executeImportAction } from "./actions"
import type { ColumnMapping, PreviewResult, ImportResult } from "@/lib/services/product-import"

const FIELD_LABELS: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: "primaryBarcode", label: "Ana Barkod", required: true },
  { key: "name", label: "Ürün Adı", required: true },
  { key: "brandName", label: "Marka", required: true },
  { key: "categoryName", label: "Kategori", required: true },
  { key: "pharmacyProductCode", label: "Eczane Master Kodu" },
  { key: "vatRate", label: "KDV Oranı" },
  { key: "mainPurchasePrice", label: "Ana Alış Fiyatı (KDV dahil)" },
  { key: "mainStock", label: "Ana Stok" },
  { key: "streetPurchasePrice", label: "Cadde Alış (KDV hariç)" },
  { key: "streetStock", label: "Cadde Stok" },
  { key: "psf", label: "PSF" },
]

export default function IceAktarPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loaded, setLoaded] = useState<{
    rows: Record<string, unknown>[]
    mapping: ColumnMapping
    preview: PreviewResult
    columns: string[]
  } | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [pending, startTransition] = useTransition()

  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await analyzeFileAction(formData)
      if (!r.success) { toast.error(r.error); return }
      setLoaded(r.data)
      setStep(2)
    })
  }

  function onMappingChange(key: keyof ColumnMapping, value: string) {
    if (!loaded) return
    const next = { ...loaded.mapping, [key]: value === "_none" ? undefined : value }
    setLoaded({ ...loaded, mapping: next })
    startTransition(async () => {
      const r = await reanalyzeAction(loaded.rows, next)
      if (r.success) setLoaded(prev => prev ? { ...prev, preview: r.data, mapping: next } : prev)
    })
  }

  function onImport() {
    if (!loaded) return
    startTransition(async () => {
      const r = await executeImportAction(loaded.rows, loaded.mapping)
      if (!r.success) { toast.error(r.error); return }
      setImportResult(r.data)
      setStep(3)
    })
  }

  const canImport = Boolean(
    loaded?.mapping.primaryBarcode &&
    loaded?.mapping.name &&
    loaded?.mapping.brandName &&
    loaded?.mapping.categoryName
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Excel / CSV İçe Aktar"
        description="Ürünleri toplu yükle — mevcut ürünler güncellenir, yeni markalar/kategoriler otomatik oluşturulur"
      />

      <div className="flex items-center gap-2 text-sm">
        <StepBadge num={1} active={step === 1} done={step > 1} label="Yükle" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <StepBadge num={2} active={step === 2} done={step > 2} label="Eşleştir ve Önizle" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <StepBadge num={3} active={step === 3} done={false} label="Sonuç" />
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dosya Yükle</CardTitle>
            <CardDescription>.xlsx, .xls veya .csv formatı</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUpload} className="space-y-4">
              <Input type="file" name="file" accept=".xlsx,.xls,.csv" required disabled={pending} />
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Yükle ve Analiz Et
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && loaded && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kolon Eşleştirme</CardTitle>
              <CardDescription>Sistem alanlarını Excel kolonlarına eşle</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {FIELD_LABELS.map(f => (
                <div key={f.key}>
                  <Label>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={loaded.mapping[f.key] ?? "_none"}
                    onValueChange={(v) => onMappingChange(f.key, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Eşleşme yok" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Eşleşme yok —</SelectItem>
                      {loaded.columns.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <StatBox label="Toplam satır" value={loaded.preview.totalRows} />
                  <StatBox label="Yeni ürün" value={loaded.preview.plannedCreates} color="success" />
                  <StatBox label="Güncellenecek" value={loaded.preview.plannedUpdates} color="warning" />
                  <StatBox
                    label="Duplicate (atlanacak)"
                    value={loaded.preview.duplicatesInFile.reduce((s, d) => s + d.rowNumbers.length - 1, 0)}
                  />
                  <StatBox
                    label="Çakışma (atlanacak)"
                    value={loaded.preview.conflicts.length}
                    color="destructive"
                  />
                  <StatBox label="Hata" value={loaded.preview.errors.length} color="destructive" />
                </div>
                {(loaded.preview.newBrands.length > 0 || loaded.preview.newCategories.length > 0) && (
                  <div className="mt-3 space-y-2">
                    {loaded.preview.newBrands.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Yeni markalar ({loaded.preview.newBrands.length}):
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {loaded.preview.newBrands.map(b => (
                            <Badge key={b} variant="secondary">{b}</Badge>
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
                          {loaded.preview.newCategories.map(c => (
                            <Badge key={c} variant="secondary">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {loaded.preview.conflicts.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">Çakışmalar (atlanacak):</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {loaded.preview.conflicts.slice(0, 10).map((c, i) => (
                        <li key={i}>
                          Satır {c.rowNumber}: &quot;{c.barcode}&quot; zaten &quot;{c.existingName}&quot; için kullanılıyor
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>İlk 5 Satır</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {loaded.columns.map(c => (
                          <TableHead key={c} className="whitespace-nowrap text-xs">{c}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loaded.preview.previewRows.map((r, i) => (
                        <TableRow key={i}>
                          {loaded.columns.map(c => (
                            <TableCell key={c} className="whitespace-nowrap text-xs">
                              {String(r[c] ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Geri
              </Button>
              <Button onClick={onImport} disabled={pending || !canImport}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                İmport Et
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && importResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div>
                <CardTitle>İmport Tamamlandı</CardTitle>
                <CardDescription>{importResult.total} satır işlendi</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox label="Yeni" value={importResult.created} color="success" />
              <StatBox label="Güncellenen" value={importResult.updated} color="warning" />
              <StatBox label="Atlanan" value={importResult.skipped + importResult.conflictSkipped} />
              <StatBox label="Hata" value={importResult.errors.length} color="destructive" />
            </div>
            {importResult.newBrands.length > 0 && (
              <div>
                <p className="text-sm font-medium">Yeni markalar oluşturuldu:</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {importResult.newBrands.map(b => (
                    <Badge key={b} variant="secondary">{b}</Badge>
                  ))}
                </div>
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium">Hatalar:</p>
                <ul className="mt-1 space-y-1 text-xs text-destructive">
                  {importResult.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>Satır {e.rowNumber}: {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                asChild
              >
                <Link
                  href="/urunler/ice-aktar"
                  onClick={() => { setStep(1); setLoaded(null); setImportResult(null) }}
                >
                  Yeni İmport
                </Link>
              </Button>
              <Button asChild>
                <Link href="/urunler">Ürünlere git</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

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
