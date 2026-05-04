import Link from "next/link"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { MatchFlow } from "./match-flow"
import { listBrandsAction, getSnapshotStatusAction } from "./actions"

export const dynamic = "force-dynamic"

export default async function BarkodEslestirmePage() {
  const config = await prisma.trendyolConfig.findUnique({ where: { id: 1 } })
  const isConfigured =
    config != null &&
    config.isActive &&
    !!config.supplierId &&
    !!config.apiKey &&
    !!config.apiSecret

  const [brands, status] = await Promise.all([
    listBrandsAction(),
    getSnapshotStatusAction(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barkod Eşleştirme"
        description="ERP, Trendyol ve Dopigo arasında ürünlerin barkod eşleşmesini görüntüle ve manuel düzelt."
      />

      {!isConfigured ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-8 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="h-10 w-10 text-amber-600" />
            <div>
              <p className="font-medium">Trendyol entegrasyonu kurulu değil</p>
              <p className="text-sm text-muted-foreground mt-1">
                Trendyol kataloğunu çekmek için API credential'ları gerekli.
              </p>
            </div>
            <Button asChild>
              <Link href="/ayarlar">Ayarlar'a git</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <MatchFlow brands={brands} initialStatus={status} />
      )}
    </div>
  )
}
