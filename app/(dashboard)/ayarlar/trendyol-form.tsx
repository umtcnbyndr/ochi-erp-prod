"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
  saveTrendyolConfigAction,
  testTrendyolConfigAction,
} from "./actions"

interface Props {
  initial: {
    supplierId: string
    apiKey: string
    apiSecret: string
    environment: "prod" | "stage"
    isActive: boolean
    lastTestedAt: Date | null
    lastTestOk: boolean | null
    lastTestNote: string | null
  } | null
}

export function TrendyolForm({ initial }: Props) {
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "")
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "")
  const [apiSecret, setApiSecret] = useState(initial?.apiSecret ?? "")
  const [environment, setEnvironment] = useState<"prod" | "stage">(
    initial?.environment ?? "prod"
  )
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [showSecret, setShowSecret] = useState(false)

  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function handleSave(alsoTest: boolean) {
    if (!supplierId.trim() || !apiKey.trim() || !apiSecret.trim()) {
      toast.error("Satıcı ID, API Key ve API Secret zorunlu")
      return
    }
    startSave(async () => {
      const result = await saveTrendyolConfigAction({
        supplierId: supplierId.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        environment,
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
      const result = await testTrendyolConfigAction()
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
              <ShieldCheck className="h-5 w-5" />
              Trendyol Seller API
            </CardTitle>
            <CardDescription>
              Satıcı paneli &gt; Hesap Bilgilerim &gt; Entegrasyon Bilgileri'nden alınır.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Satıcı ID *</Label>
            <Input
              id="supplierId"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              placeholder="123456"
              className="tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="environment">Ortam</Label>
            <Select
              value={environment}
              onValueChange={(v) => setEnvironment(v as "prod" | "stage")}
            >
              <SelectTrigger id="environment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prod">Canlı (apigw.trendyol.com)</SelectItem>
                <SelectItem value="stage">Test (stageapigw.trendyol.com)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="apiKey">API Key *</Label>
            <Input
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API key"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="apiSecret" className="flex items-center justify-between">
              <span>API Secret *</span>
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showSecret ? "Gizle" : "Göster"}
              </button>
            </Label>
            <Input
              id="apiSecret"
              type={showSecret ? "text" : "password"}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="API secret"
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <input
            id="isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="isActive" className="text-sm cursor-pointer">
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
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
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
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Bağlantıyı Test Et
          </Button>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-3">
          ℹ️ <strong>Test ortamı kullanıyorsan</strong>: Sunucunun IP adresinin Trendyol
          tarafından whitelist'e eklenmiş olması gerekir (0850 258 58 00 üzerinden talep et).
          Canlı ortam için IP whitelist gerekmez.
        </p>
      </CardContent>
    </Card>
  )
}
