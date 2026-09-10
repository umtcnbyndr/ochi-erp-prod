import Link from "next/link"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { getAuthUser } from "@/lib/permissions"
import { resolveProductUnitCost } from "@/lib/pricing/effective-purchase-price"
import { TakasTabs } from "./takas-tabs"

export const dynamic = "force-dynamic"

export default async function TakasPage() {
  const user = await getAuthUser()
  const isAdmin = user?.role === "ADMIN"
  const [counterparties, pendingRaw] = await Promise.all([
    prisma.counterparty.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    prisma.exchange.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        counterparty: { select: { id: true, name: true, type: true } },
        product: {
          select: {
            id: true,
            name: true,
            primaryBarcode: true,
            mainStock: true,
            exchangeStock: true,
            // Takas kapatma maliyet üzerinden yapılıyor → birim maliyet gerekli
            mainPurchasePrice: true,
            streetPurchasePrice: true,
            vatRate: true,
            brand: {
              select: {
                yearEndDiscount1: true,
                yearEndDiscount2: true,
                yearEndDiscount3: true,
                pharmacyMargin: true,
              },
            },
          },
        },
      },
      take: 200,
    }),
  ])

  const pending = pendingRaw.map((ex) => {
    // Kapatmada kullanılacak birim maliyet: kayda mühürlenmiş fiyat öncelikli,
    // yoksa sistemin COGS kuralı (ana alış > cadde çevrimi).
    const sealed = ex.unitPrice != null ? Number(ex.unitPrice) : null
    const unitCost =
      sealed != null && sealed > 0
        ? sealed
        : resolveProductUnitCost({
            mainPurchasePrice: ex.product.mainPurchasePrice,
            streetPurchasePrice: ex.product.streetPurchasePrice,
            vatRate: ex.product.vatRate,
            brand: ex.product.brand,
          })
    return {
      id: ex.id,
      direction: ex.direction,
      quantity: ex.quantity,
      quantityToStock: ex.quantityToStock,
      unitPrice: sealed,
      unitCost,
      /** Maliyet kayda mühürlenmiş mi (false = bugünkü fiyattan hesaplandı) */
      costSealed: sealed != null && sealed > 0,
      note: ex.note,
      createdAt: ex.createdAt.toISOString(),
      counterparty: ex.counterparty,
      product: {
        id: ex.product.id,
        name: ex.product.name,
        primaryBarcode: ex.product.primaryBarcode,
        mainStock: ex.product.mainStock,
        exchangeStock: ex.product.exchangeStock,
      },
    }
  })

  const noCounterparty = counterparties.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Takas"
        description="Eczane fatura bekleyen alış/satış + dış cari ile ürün karşılığı takas"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/cariler">Cariler</Link>
          </Button>
        }
      />

      {noCounterparty ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Takas yapabilmek için önce en az bir cari tanımlamalısın (örn. eczane, distribütör).
          </p>
          <Button asChild>
            <Link href="/cariler">Cari Ekle</Link>
          </Button>
        </div>
      ) : (
        <TakasTabs counterparties={counterparties} pending={pending} isAdmin={isAdmin} />
      )}
    </div>
  )
}
