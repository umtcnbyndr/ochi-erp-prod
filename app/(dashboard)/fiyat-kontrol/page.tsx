import Link from "next/link"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { FiyatKontrolFlow } from "./fiyat-kontrol-flow"
import { listBrandsForBuyboxAction } from "./actions"

export const dynamic = "force-dynamic"

export default async function FiyatKontrolPage() {
  const config = await prisma.trendyolConfig.findUnique({ where: { id: 1 } })
  const isConfigured =
    config != null &&
    config.isActive &&
    !!config.supplierId &&
    !!config.apiKey &&
    !!config.apiSecret

  const brands = isConfigured ? await listBrandsForBuyboxAction() : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fiyat Kontrol"
        description="Trendyol BuyBox sahibini, fiyatını ve rekabet durumunu sorgula. Kar/zarar analizini gör."
      />

      {!isConfigured ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-8 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="h-10 w-10 text-amber-600" />
            <div>
              <p className="font-medium">Trendyol entegrasyonu kurulu değil</p>
              <p className="text-sm text-muted-foreground mt-1">
                BuyBox sorgusu yapabilmek için önce Trendyol API credential'larını gir.
              </p>
            </div>
            <Button asChild>
              <Link href="/ayarlar">Ayarlar'a git</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <FiyatKontrolFlow brands={brands} />
      )}
    </div>
  )
}
