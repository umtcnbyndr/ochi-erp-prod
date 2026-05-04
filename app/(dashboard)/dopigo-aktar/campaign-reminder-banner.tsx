"use client"

import Link from "next/link"
import { Megaphone, AlertTriangle, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ReminderCampaign {
  id: number
  name: string
  type: "BRAND" | "PRODUCTS"
  brandId: number | null
  brandName: string | null
  discountRate: number
  endDate: string
  status: "ACTIVE" | "ENDED"
}

interface Props {
  campaigns: ReminderCampaign[]
}

export function CampaignReminderBanner({ campaigns }: Props) {
  const active = campaigns.filter((c) => c.status === "ACTIVE")
  const ended = campaigns.filter((c) => c.status === "ENDED")

  if (active.length === 0 && ended.length === 0) return null

  return (
    <div className="space-y-2">
      {/* Aktif kampanyalar — bilgilendirme */}
      {active.length > 0 && (
        <Card className="border-pink-300 bg-pink-50/50 dark:border-pink-800 dark:bg-pink-950/20">
          <CardContent className="p-3 flex items-start gap-3">
            <Megaphone className="h-5 w-5 shrink-0 text-pink-600 dark:text-pink-400 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {active.length === 1
                  ? "1 aktif kampanya var — Excel'de fiyatlar kampanyalı"
                  : `${active.length} aktif kampanya var — Excel'de fiyatlar kampanyalı`}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {active.map((c) => (
                  <Badge
                    key={c.id}
                    variant="secondary"
                    className="text-[10px] gap-1 bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300"
                  >
                    {c.name} · %{c.discountRate.toFixed(0)}
                  </Badge>
                ))}
              </div>
            </div>
            <Link href="/kampanyalar">
              <Button size="sm" variant="ghost" className="text-xs h-7">
                Detay
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Bitmiş kampanyalar — fiyatları normal'e döndür uyarısı */}
      {ended.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {ended.length === 1
                  ? "1 kampanya bitti — fiyatları normale döndürmek için Excel yükle"
                  : `${ended.length} kampanya bitti — fiyatları normale döndürmek için Excel yükle`}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Bitmiş kampanyalar fiyat hesabını etkilemez. Aşağıdaki ilgili
                markaları seçip yeni fiyatlı Excel hazırla ve Dopigo'ya yükle.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ended.map((c) => (
                  <Badge
                    key={c.id}
                    variant="secondary"
                    className="text-[10px] gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  >
                    {c.name}
                    {c.brandName && (
                      <span className="opacity-70">· {c.brandName}</span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
            <Link href="/kampanyalar">
              <Button size="sm" variant="outline" className="text-xs h-7">
                Tahsilat Yap
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
