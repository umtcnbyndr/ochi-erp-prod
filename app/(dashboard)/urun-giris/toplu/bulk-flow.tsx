"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Upload,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileSpreadsheet,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  previewBulkEntryAction,
  executeBulkEntryAction,
} from "../actions"
import type {
  BulkEntryRow,
  BulkPreviewResult,
} from "@/lib/services/product-entry"

interface Counterparty {
  id: number
  name: string
}

export function BulkEntryFlow({ counterparties }: { counterparties: Counterparty[] }) {
  const [pasted, setPasted] = useState("")
  const [preview, setPreview] = useState<BulkPreviewResult | null>(null)
  const [pending, startTransition] = useTransition()

  // Header
  const [source, setSource] = useState<"PURCHASE" | "RETURN">("PURCHASE")
  const [counterpartyId, setCounterpartyId] = useState<string>("")
  const [generalNote, setGeneralNote] = useState("")
  const [brandInvoice, setBrandInvoice] = useState("")
  const [pharmLabel, setPharmLabel] = useState("")
  const [pharmPending, setPharmPending] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function parseRowsFromText(text: string): BulkEntryRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const rows: BulkEntryRow[] = []
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim()
      // Header satırı atla (içinde "barkod" veya "stok" geçiyorsa)
      if (i === 0 && /barkod|stok|alış|alis/i.test(raw)) continue
      // Ayraç: ; , veya tab
      const parts = raw.split(/[;,\t]/).map((p) => p.trim())
      if (parts.length < 2) continue
      const barcode = parts[0]
      const quantity = Number(parts[1])
      const unitPrice =
        parts[2] != null && parts[2] !== ""
          ? Number(parts[2].replace(",", "."))
          : null
      if (!barcode) continue
      if (!Number.isFinite(quantity)) continue
      rows.push({
        rowNumber: i + 1,
        barcode,
        quantity,
        unitPrice: Number.isFinite(unitPrice as number) ? (unitPrice as number) : null,
      })
    }
    return rows
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      if (!data) return
      try {
        const wb = XLSX.read(data, { type: "binary" })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        })
        const rows: BulkEntryRow[] = []
        json.forEach((r, idx) => {
          const keys = Object.keys(r)
          // Esnek kolon eşleştirme — "Barkod", "Stok", "Alış"/"Alis"
          const findKey = (patterns: string[]) =>
            keys.find((k) => {
              const n = k.toLocaleLowerCase("tr").trim()
              return patterns.some((p) => n.includes(p))
            })
          const bcKey = findKey(["barkod", "barcode", "gtin"])
          const qtyKey = findKey(["stok", "miktar", "adet", "quantity"])
          const priceKey = findKey(["alış", "alis", "price", "fiyat"])
          if (!bcKey || !qtyKey) return
          const barcode = String(r[bcKey] ?? "").trim()
          const quantity = Number(r[qtyKey])
          const unitPrice = priceKey
            ? Number(String(r[priceKey] ?? "").replace(",", "."))
            : null
          if (!barcode || !Number.isFinite(quantity)) return
          rows.push({
            rowNumber: idx + 2,
            barcode,
            quantity,
            unitPrice: Number.isFinite(unitPrice as number) ? (unitPrice as number) : null,
          })
        })
        // Textarea'yı da sync et (kullanıcı düzenleyebilsin)
        const text = rows
          .map((r) => `${r.barcode};${r.quantity};${r.unitPrice ?? ""}`)
          .join("\n")
        setPasted(text)
        toast.success(`${rows.length} satır okundu — şimdi 'Önizle'ye bas`)
      } catch (err) {
        toast.error("Excel okunamadı: " + (err instanceof Error ? err.message : ""))
      }
    }
    reader.readAsBinaryString(file)
  }

  function onPreview() {
    const rows = parseRowsFromText(pasted)
    if (rows.length === 0) {
      toast.error("Geçerli satır bulunamadı")
      return
    }
    startTransition(async () => {
      const res = await previewBulkEntryAction(rows)
      if (res.success) {
        setPreview(res.data)
        const m = res.data.matched.length
        const u = res.data.missed.length
        if (u > 0) {
          toast.warning(`${m} eşleşti, ${u} bulunamadı — listeye bak`)
        } else {
          toast.success(`${m} satır eşleşti, kaydetmeye hazır`)
        }
      } else {
        toast.error(res.error)
      }
    })
  }

  function onSave() {
    if (!preview || preview.matched.length === 0) {
      toast.error("Eşleşen satır yok")
      return
    }
    if (
      !confirm(
        `${preview.matched.length} ürün için stok girişi yapılacak. Devam?\n\n` +
          `Toplam adet: ${preview.matched.reduce((s, r) => s + r.quantity, 0)}\n` +
          `Bulunamayan ${preview.missed.length} satır atlanır.`,
      )
    )
      return
    startTransition(async () => {
      const res = await executeBulkEntryAction(preview.matched, {
        source,
        counterpartyId: counterpartyId ? Number(counterpartyId) : null,
        generalNote: generalNote.trim() || null,
        brandInvoiceNumber: brandInvoice.trim() || null,
        pharmacyInvoiceLabel: pharmLabel.trim() || null,
        pharmacyInvoicePending: pharmPending,
      })
      if (res.success) {
        toast.success(
          `Toplu giriş tamam: ${res.data.lineCount} kalem, ${res.data.totalQuantity} adet (${res.data.priceChanged} ürünün alış fiyatı güncellendi)`,
        )
        setPasted("")
        setPreview(null)
        setBrandInvoice("")
        setPharmLabel("")
        setGeneralNote("")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* SOL: Veri girişi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Veri Girişi
          </CardTitle>
          <CardDescription>
            Excel yükle veya satır satır yapıştır. Format:{" "}
            <code className="text-xs">barkod;stok;alış</code> (alış opsiyonel,
            KDV dahil)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Excel Yükle
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <span className="text-xs text-muted-foreground">
              Beklenen kolon adları: Barkod, Stok, Alış
            </span>
          </div>

          <Textarea
            rows={12}
            placeholder={`Örnek:
8690595XXX;10;125.50
8690595YYY;5;89
3337875XXX;3`}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            className="font-mono text-xs"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {parseRowsFromText(pasted).length} satır
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPasted("")
                  setPreview(null)
                }}
                disabled={pending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Temizle
              </Button>
              <Button size="sm" onClick={onPreview} disabled={pending || !pasted.trim()}>
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : null}
                Önizle ve Eşleştir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SAĞ: Seans bilgileri */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seans Bilgileri</CardTitle>
          <CardDescription>
            Tüm satırlar tek seansa kaydedilir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Kaynak</Label>
              <Select value={source} onValueChange={(v) => setSource(v as "PURCHASE" | "RETURN")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASE">Satın alma</SelectItem>
                  <SelectItem value="RETURN">İade (gelen)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cari (opsiyonel)</Label>
              <Select value={counterpartyId} onValueChange={setCounterpartyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Yok —</SelectItem>
                  {counterparties.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Marka Fatura No (opsiyonel)</Label>
            <Input
              value={brandInvoice}
              onChange={(e) => setBrandInvoice(e.target.value)}
              className="h-9"
              placeholder="örn 2026-001234"
              disabled={source === "RETURN"}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Eczane Fatura Etiketi (opsiyonel)</Label>
            <Input
              value={pharmLabel}
              onChange={(e) => setPharmLabel(e.target.value)}
              className="h-9"
              placeholder="örn 2026-05 mal kabul"
              disabled={source === "RETURN"}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pharmPending}
              onChange={(e) => setPharmPending(e.target.checked)}
              disabled={source === "RETURN"}
            />
            <span>Eczane faturası bekleniyor</span>
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs">Genel Not</Label>
            <Textarea
              value={generalNote}
              onChange={(e) => setGeneralNote(e.target.value)}
              rows={2}
              placeholder="Tüm kalemler için ortak not"
            />
          </div>
        </CardContent>
      </Card>

      {/* ALT: Önizleme */}
      {preview && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Önizleme
                  <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {preview.matched.length} eşleşti
                  </Badge>
                  {preview.missed.length > 0 && (
                    <Badge variant="outline" className="bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {preview.missed.length} bulunamadı
                    </Badge>
                  )}
                  {preview.duplicateBarcodes.length > 0 && (
                    <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                      ⚠️ {preview.duplicateBarcodes.length} dosyada duplicate barkod
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Eşleşen ürünler aşağıda. Bulunamayan satırlar atlanır.
                </CardDescription>
              </div>
              <Button
                onClick={onSave}
                disabled={pending || preview.matched.length === 0}
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                {preview.matched.length} ürünü Kaydet
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.matched.length > 0 && (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Satır</TableHead>
                      <TableHead>Barkod</TableHead>
                      <TableHead>Ürün</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right">Alış (KDV dahil)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.matched.map((m) => (
                      <TableRow key={m.rowNumber}>
                        <TableCell className="text-xs text-muted-foreground">
                          #{m.rowNumber}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{m.barcode}</TableCell>
                        <TableCell className="text-sm">{m.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.unitPrice != null ? `₺${m.unitPrice.toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {preview.missed.length > 0 && (
              <div className="border rounded-md border-rose-200 dark:border-rose-900">
                <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900 text-sm font-medium text-rose-700 dark:text-rose-300">
                  Bulunamayan satırlar ({preview.missed.length})
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Satır</TableHead>
                      <TableHead>Barkod</TableHead>
                      <TableHead>Sebep</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.missed.map((m) => (
                      <TableRow key={m.rowNumber}>
                        <TableCell className="text-xs text-muted-foreground">
                          #{m.rowNumber}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{m.barcode}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
