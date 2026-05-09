"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, XCircle, Loader2, ShoppingBasket, Eye } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { saveDopigoConfigAction, testDopigoConfigAction } from "./actions"

interface Props {
  initial: {
    apiToken: string // "***" placeholder veya boş
    isActive: boolean
    lastTestedAt: Date | null
    lastTestOk: boolean | null
    lastTestNote: string | null
  } | null
}

export function DopigoForm({ initial }: Props) {
  const [apiToken, setApiToken] = useState(initial?.apiToken ?? "")
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [showToken, setShowToken] = useState(false)

  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function handleSave(alsoTest: boolean) {
    if (!apiToken.trim()) {
      toast.error("API Token zorunlu")
      return
    }
    startSave(async () => {
      const result = await saveDopigoConfigAction({
        apiToken: apiToken.trim(),
        isActive,
        alsoTest,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.tested && result.testMessage) {
        toast.success(`Kaydedildi · ${result.testMessage}`)
      } else {
        toast.success("Kaydedildi")
      }
    })
  }

  function handleTestOnly() {
    startTest(async () => {
      const result = await testDopigoConfigAction()
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBasket className="h-5 w-5" />
              Dopigo API
            </CardTitle>
            <CardDescription>
              <strong>Sadece okuma.</strong> Sipariş çekmek için kullanılır, Dopigo&apos;ya hiçbir veri gönderilmez.
              Token panel.dopigo.com → Hesap &gt; API&apos;den alınır.
            </CardDescription>
          </div>

          {initial?.lastTestedAt && (
            <Badge
              variant="outline"
              className={
                initial.lastTestOk
                  ? "border-green-500/40 text-green-700 dark:text-green-400"
                  : "border-destructive/40 text-destructive"
              }
            >
              {initial.lastTestOk ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : (
                <XCircle className="h-3 w-3 mr-1" />
              )}
              {new Date(initial.lastTestedAt).toLocaleString("tr-TR")}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dopigoToken" className="flex items-center justify-between">
            <span>API Token *</span>
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <Eye className="h-3 w-3" />
              {showToken ? "Gizle" : "Göster"}
            </button>
          </Label>
          <Input
            id="dopigoToken"
            type={showToken ? "text" : "password"}
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={initial ? "Mevcut token kayıtlı (yenisini girmek için temizle)" : "a4f94e388d25..."}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <input
            id="dopigoActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="dopigoActive" className="text-sm cursor-pointer">
            Entegrasyon aktif
          </Label>
        </div>

        {initial?.lastTestNote && (
          <div
            className={
              "rounded-md border px-3 py-2 text-xs " +
              (initial.lastTestOk
                ? "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400"
                : "border-destructive/30 bg-destructive/5 text-destructive")
            }
          >
            Son test: {initial.lastTestNote}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            onClick={() => handleSave(true)}
            disabled={saving || testing}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Kaydet ve Test Et
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving || testing}
          >
            Sadece Kaydet
          </Button>
          <Button
            variant="ghost"
            onClick={handleTestOnly}
            disabled={saving || testing || !initial}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Bağlantıyı Test Et
          </Button>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-3">
          ℹ️ Dopigo API <strong>tek yönlü</strong> kullanılır: sadece sipariş/müşteri okur. Stok/fiyat
          güncellemeleri Dopigo Excel akışıyla yapılır (bu sayfa onu değiştirmez).
        </p>
      </CardContent>
    </Card>
  )
}
