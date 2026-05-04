"use client"

import { useRef, useState, useTransition } from "react"
import { Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { uploadDopigoExcelAction, type DopigoUploadResult } from "./actions"

export function DopigoUploadFlow() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<DopigoUploadResult | null>(null)
  const [filename, setFilename] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) {
      setFilename(null)
      return
    }
    setFilename(f.name)
    setResult(null)
  }

  function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error("Önce bir Excel dosyası seç")
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    startTransition(async () => {
      const r = await uploadDopigoExcelAction(fd)
      setResult(r)
      if (!r.success) {
        toast.error(r.error ?? "Yükleme başarısız")
        return
      }
      toast.success(
        `${r.data?.rowCount ?? 0} satır işlendi (${r.data?.withBarcode ?? 0} barkodlu)`,
      )
      // input'u sıfırla
      if (fileRef.current) fileRef.current.value = ""
      setFilename(null)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Dopigo Excel Yükle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Dopigo&apos;dan dışa aktardığın Excel</p>
          <p className="text-xs text-muted-foreground">
            .xlsx, .xls veya .csv — 97 sütunlu standart Dopigo formatı
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={pending}
            className="mt-3 mx-auto block text-xs"
          />
          {filename && (
            <p className="mt-2 text-xs text-muted-foreground">
              Seçili: <span className="font-mono">{filename}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Yükleme &quot;truncate-and-insert&quot; modunda — önceki snapshot silinir.
          </p>
          <Button onClick={handleUpload} disabled={pending || !filename} className="gap-2">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {pending ? "Yükleniyor..." : "Yükle"}
          </Button>
        </div>

        {result && result.success && result.data && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Yükleme başarılı</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.data.rowCount.toLocaleString("tr-TR")} satır işlendi (
                {result.data.withBarcode.toLocaleString("tr-TR")} barkodlu) —{" "}
                {result.data.durationMs}ms
              </p>
            </div>
          </div>
        )}

        {result && !result.success && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Yükleme başarısız</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.error}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
