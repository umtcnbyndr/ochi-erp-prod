"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, CheckCircle2, AlertCircle, Loader2, Search } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useConfirm } from "@/components/common/confirm-provider"
import {
  previewRenameAction,
  applyRenameAction,
  type RenamePreviewResult,
} from "./actions"

export function RenameFlow() {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState<RenamePreviewResult | null>(null)
  const [filter, setFilter] = useState<"changed" | "all">("changed")
  const [search, setSearch] = useState("")

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    startTransition(async () => {
      const res = await previewRenameAction(fd)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setPreview(res.data)
      toast.success(
        `${res.data.matched} eşleşti · ${res.data.notFound} bulunamadı · ${res.data.rows.length - res.data.noChange} isim değişecek`,
      )
    })
  }

  async function handleApply() {
    if (!preview) return
    const toApply = preview.rows.filter((r) => r.changed)
    if (toApply.length === 0) {
      toast.warning("Değişecek isim yok")
      return
    }
    const ok = await confirm({
      title: `${toApply.length} ürünün ismi güncellenecek`,
      description:
        "Sadece 'Ürün Adı' alanı güncellenir. Alış/stok/PSF/kategori/marka HİÇBİRİ değişmez. Devam edilsin mi?",
      confirmText: "Uygula",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await applyRenameAction(
        toApply.map((r) => ({
          productId: r.productId,
          oldName: r.oldName,
          newName: r.newName,
        })),
      )
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(`${res.data.updated} ürün güncellendi`)
      setPreview(null)
      router.refresh()
    })
  }

  const filteredRows = preview
    ? preview.rows.filter((r) => {
        if (filter === "changed" && !r.changed) return false
        if (search.trim()) {
          const q = search.trim().toLocaleLowerCase("tr")
          return (
            r.barcode.includes(q) ||
            r.oldName.toLocaleLowerCase("tr").includes(q) ||
            r.newName.toLocaleLowerCase("tr").includes(q)
          )
        }
        return true
      })
    : []

  return (
    <>
      {/* Dosya yükle */}
      <Card>
        <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Excel dosyası seç</p>
            <p className="text-xs text-muted-foreground mt-1">
              Barkod + Ürün Adı kolonları olan herhangi bir xlsx dosyası kabul edilir.
              <br />
              Diğer kolonlar yok sayılır.
            </p>
          </div>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={pending}
            className="max-w-xs"
          />
          {pending && !preview && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analiz ediliyor...
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      {preview && (
        <>
          {/* Özet */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Toplam Satır
                </p>
                <p className="text-2xl font-bold tabular-nums">{preview.totalRows}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-emerald-600">Eşleşti</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">
                  {preview.matched}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-primary">
                  İsim Değişecek
                </p>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {preview.rows.length - preview.noChange}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-amber-600">Bulunamadı</p>
                <p className="text-2xl font-bold tabular-nums text-amber-600">
                  {preview.notFound}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Bulunamayan barkodlar */}
          {preview.notFoundBarcodes.length > 0 && (
            <Card className="border-amber-200/40 bg-amber-50/30 dark:bg-amber-950/10">
              <CardContent className="p-5 text-xs space-y-2">
                <p className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {preview.notFoundBarcodes.length} barkod sistemde bulunamadı (atlanacak):
                </p>
                <div className="flex flex-wrap gap-1">
                  {preview.notFoundBarcodes.slice(0, 30).map((bc) => (
                    <code key={bc} className="rounded bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5">
                      {bc}
                    </code>
                  ))}
                  {preview.notFoundBarcodes.length > 30 && (
                    <span className="text-muted-foreground">
                      ... ve {preview.notFoundBarcodes.length - 30} tane daha
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filtre + Uygula */}
          <Card>
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Barkod / isim ara..."
                  className="pl-8 h-9"
                />
              </div>
              <Button
                size="sm"
                variant={filter === "changed" ? "default" : "outline"}
                onClick={() => setFilter("changed")}
                className="h-9"
              >
                Sadece değişenler ({preview.rows.length - preview.noChange})
              </Button>
              <Button
                size="sm"
                variant={filter === "all" ? "default" : "outline"}
                onClick={() => setFilter("all")}
                className="h-9"
              >
                Tümü ({preview.rows.length})
              </Button>

              <Button
                onClick={handleApply}
                disabled={pending || preview.rows.length - preview.noChange === 0}
                className="ml-auto h-9 gap-1.5"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uygulanıyor...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {preview.rows.length - preview.noChange} ismi uygula
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Tablo */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="text-[12px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Barkod</TableHead>
                      <TableHead>Eski İsim</TableHead>
                      <TableHead>Yeni İsim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Eşleşen satır yok
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.slice(0, 500).map((r) => (
                        <TableRow key={r.productId} className={!r.changed ? "opacity-50" : ""}>
                          <TableCell>
                            {r.changed ? (
                              <Badge variant="default" className="text-[9px] px-1.5 py-0">
                                Δ
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                =
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">{r.barcode}</TableCell>
                          <TableCell className={r.changed ? "text-muted-foreground line-through" : ""}>
                            {r.oldName}
                          </TableCell>
                          <TableCell className={r.changed ? "font-medium text-emerald-600" : "text-muted-foreground"}>
                            {r.newName}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {filteredRows.length > 500 && (
                  <p className="p-3 text-[11px] text-muted-foreground text-center border-t">
                    İlk 500 satır gösterildi (toplam {filteredRows.length}). Hepsi uygulanır.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
