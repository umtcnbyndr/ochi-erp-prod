"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { AlertTriangle, Trash2, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resetStockHistoryAction, type ResetReportClient } from "../actions"

interface Stats {
  stockMovementCount: number
  entrySessionCount: number
  priceHistoryCount: number
  productCount: number
  totalMainStock: number
}

const CONFIRM_PHRASE = "STOK RESETLE"

export function ResetFlow({ stats }: { stats: Stats }) {
  const [confirmText, setConfirmText] = useState("")
  const [pending, startTransition] = useTransition()
  const [report, setReport] = useState<ResetReportClient | null>(null)

  function onReset() {
    if (confirmText !== CONFIRM_PHRASE) {
      toast.error(`Onay metnini "${CONFIRM_PHRASE}" olarak yazmanız gerekiyor`)
      return
    }
    if (
      !confirm(
        `SON UYARI:\n\n` +
          `${stats.stockMovementCount} stok hareketi silinecek\n` +
          `${stats.entrySessionCount} mal kabul seansı silinecek\n` +
          `${stats.priceHistoryCount} alış fiyatı geçmişi silinecek\n` +
          `${stats.productCount} ürünün stok ve alış değerleri sıfırlanacak\n\n` +
          `BU İŞLEM GERİ ALINAMAZ.\nDevam etmek istiyor musun?`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const res = await resetStockHistoryAction(confirmText)
      if (res.success) {
        setReport(res.data)
        toast.success("Sistem sıfırlandı — temiz başlangıç hazır")
      } else {
        toast.error(res.error)
      }
    })
  }

  if (report) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            Sıfırlama Tamamlandı
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="space-y-1.5">
            <li>✓ <strong>{report.deletedStockMovements}</strong> stok hareketi silindi</li>
            <li>✓ <strong>{report.deletedEntrySessions}</strong> mal kabul seansı silindi</li>
            <li>✓ <strong>{report.deletedPriceHistoryMain}</strong> alış geçmişi silindi</li>
            <li>✓ <strong>{report.productsResetCount}</strong> ürünün ana stok ve alış değeri sıfırlandı</li>
          </ul>
          <p className="text-muted-foreground pt-2">
            Şimdi <Link href="/urun-giris/toplu" className="underline font-medium">Toplu Ürün Girişi</Link>'nden gerçek stok ve alış fiyatlarını yükleyebilirsin.
          </p>
          <div className="pt-3 flex gap-2">
            <Link href="/urun-giris/toplu">
              <Button>Toplu Girişe Geç →</Button>
            </Link>
            <Link href="/ayarlar">
              <Button variant="outline">Ayarlara Dön</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/ayarlar" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Ayarlara dön
      </Link>

      {/* Uyarı kartı */}
      <Card className="border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
            Geri Alınamaz İşlem
          </CardTitle>
          <CardDescription>
            Bu sayfa <strong>yalnız sisteme aktif geçişten önce</strong> bir kez kullanılır. Aktif kullanım sonrası bu işlemi yapma.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Etkilenecek veriler */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Silinecekler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-y-2">
            <span className="text-muted-foreground">Stok hareketleri</span>
            <span className="font-mono tabular-nums">{stats.stockMovementCount}</span>
            <span className="text-muted-foreground">Mal kabul seansları</span>
            <span className="font-mono tabular-nums">{stats.entrySessionCount}</span>
            <span className="text-muted-foreground">Ana alış fiyat geçmişi</span>
            <span className="font-mono tabular-nums">{stats.priceHistoryCount}</span>
            <span className="text-muted-foreground">Toplam ana stok (sıfırlanacak)</span>
            <span className="font-mono tabular-nums">{stats.totalMainStock}</span>
            <span className="text-muted-foreground">Etkilenecek ürün sayısı</span>
            <span className="font-mono tabular-nums">{stats.productCount}</span>
          </div>
          <div className="pt-3 border-t mt-3 text-xs text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">Korunacaklar (dokunulmaz):</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Cadde stoğu (eczane verisi)</li>
              <li>Cadde alış fiyatı + PSF</li>
              <li>Takas (Exchange) kayıtları + exchangeStock</li>
              <li>Ürün kataloğu (ad, marka, kategori, barkod, listings)</li>
              <li>Pazaryeri fiyatları + BuyBox geçmişi</li>
              <li>PSF ve Cadde alış fiyat geçmişi</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Onay */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onay</CardTitle>
          <CardDescription>
            Devam etmek için aşağıdaki kutuya{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{CONFIRM_PHRASE}</code>{" "}
            yaz, sonra butona bas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-xs">
              Onay metni
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <Button
            variant="destructive"
            onClick={onReset}
            disabled={pending || confirmText !== CONFIRM_PHRASE}
            className="w-full"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Stok ve Alış Geçmişini Sil
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
