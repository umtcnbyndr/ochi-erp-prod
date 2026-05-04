import Link from "next/link"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { FiyatOnerileriFlow } from "./fiyat-onerileri-flow"

export const dynamic = "force-dynamic"

export default async function FiyatOnerileriPage() {
  const [config, brandsRaw, marketplaces] = await Promise.all([
    prisma.trendyolConfig.findUnique({ where: { id: 1 } }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        priceUndercutBuffer: true,
        _count: {
          select: {
            products: {
              where: { status: "ACTIVE", productType: { not: "SET" } },
            },
          },
        },
      },
    }),
    prisma.marketplace.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const isConfigured =
    config != null &&
    config.isActive &&
    !!config.supplierId &&
    !!config.apiKey &&
    !!config.apiSecret

  const brands = brandsRaw
    .filter((b) => b._count.products > 0)
    .map((b) => ({
      id: b.id,
      name: b.name,
      productCount: b._count.products,
      priceUndercutBuffer: Number(b.priceUndercutBuffer ?? 0),
    }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fiyat Önerileri"
        description="Trendyol BuyBox'a göre akıllı fiyat önerileri. Tazele → tablo gör → anormali manuel sabitle. Onaylanan öneriler Dopigo aktarımında otomatik kullanılır."
      />

      {!isConfigured ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-8 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="h-10 w-10 text-amber-600" />
            <div>
              <p className="font-medium">Trendyol entegrasyonu kurulu değil</p>
              <p className="text-sm text-muted-foreground mt-1">
                BuyBox tabanlı öneri için Trendyol API credential'ları gerekli.
              </p>
            </div>
            <Button asChild>
              <Link href="/ayarlar">Ayarlar&apos;a git</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <FiyatOnerileriFlow brands={brands} marketplaces={marketplaces} />
      )}
    </div>
  )
}
