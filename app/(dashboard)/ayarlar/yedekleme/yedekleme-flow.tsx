"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Download,
  Package,
  FileSpreadsheet,
  Archive,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface ModuleItem {
  key: string
  label: string
  filename: string
  description: string
}

interface Group {
  title: string
  modules: ModuleItem[]
}

interface Props {
  groups: Group[]
}

export function YedeklemeFlow({ groups }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)

  async function downloadModule(moduleKey: string, label: string) {
    setDownloading(moduleKey)
    try {
      const res = await fetch(`/api/export?module=${encodeURIComponent(moduleKey)}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Hata" }))
        toast.error(`${label}: ${err.error ?? "İndirme hatası"}`)
        return
      }
      // Browser indirme
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      // Filename'i Content-Disposition header'ından al
      const cd = res.headers.get("Content-Disposition")
      const match = cd?.match(/filename="(.+?)"/)
      a.download = match?.[1] ?? `${moduleKey}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${label} indirildi`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "İndirme hatası")
    } finally {
      setDownloading(null)
    }
  }

  async function downloadAll() {
    setDownloading("all")
    try {
      const res = await fetch("/api/export?module=all")
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Hata" }))
        toast.error(err.error ?? "ZIP indirme hatası")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const cd = res.headers.get("Content-Disposition")
      const match = cd?.match(/filename="(.+?)"/)
      a.download = match?.[1] ?? "ochi-erp-yedek.zip"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Tüm sistem yedeği indirildi (ZIP)")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ZIP hatası")
    } finally {
      setDownloading(null)
    }
  }

  const totalModules = groups.reduce((s, g) => s + g.modules.length, 0)

  return (
    <div className="space-y-4">
      {/* Üst Banner: Tümünü İndir */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Archive className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Tüm Sistemi İndir (ZIP)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalModules} modülün tamamı tek bir ZIP dosyası olarak indirilir. Klasör
                  yapısı korunur, hata olursa loglanır. 1-3 dakika sürebilir.
                </p>
              </div>
            </div>
            <Button
              onClick={downloadAll}
              disabled={downloading !== null}
              size="lg"
              className="gap-2 whitespace-nowrap"
            >
              {downloading === "all" ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Hazırlanıyor...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Tümünü İndir (ZIP)
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modül Grupları */}
      {groups.map((group) => (
        <Card key={group.title}>
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b bg-muted/30">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                {group.title}
                <Badge variant="outline" className="text-[10px] ml-1">
                  {group.modules.length} modül
                </Badge>
              </h3>
            </div>
            <div className="divide-y">
              {group.modules.map((mod) => (
                <div
                  key={mod.key}
                  className="flex items-start justify-between gap-3 p-4 hover:bg-accent/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{mod.label}</div>
                    {mod.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {mod.description}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                      {mod.filename}.xlsx
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadModule(mod.key, mod.label)}
                    disabled={downloading !== null}
                    className="gap-1.5 shrink-0"
                  >
                    {downloading === mod.key ? (
                      <span className="animate-spin">⟳</span>
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    )}
                    İndir
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Bilgi notu */}
      <Card className="border-amber-200/40 bg-amber-50/30 dark:bg-amber-950/10">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong className="text-foreground">Felaket Kurtarma:</strong> Bu yedek dosyaları
              dilediğin zaman indirilebilir. Drive entegrasyonu eklenince otomatik aylık yedek
              de devreye girecek.
            </p>
            <p>
              <strong className="text-foreground">Hassas Veri:</strong> Yedek dosyaları
              sistemdeki tüm bilgiyi içerir (alış fiyatları, kullanıcı bilgileri, fatura no'lar
              vs). Güvenli yerde sakla.
            </p>
            <p>
              <strong className="text-foreground">Stok Hareketleri:</strong> Son 50.000 hareket
              indirilir (geçmişi temizleme istersen 2 yıldan eskilerini arşivlemek mantıklı).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
