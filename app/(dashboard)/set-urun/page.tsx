import Link from "next/link"
import { Plus, Boxes } from "lucide-react"
import { listSets } from "@/lib/services/set-product"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import { SetList, type SetListItem } from "./set-list"

export const dynamic = "force-dynamic"

export default async function SetUrunPage() {
  const sets = await listSets()

  const setListData: SetListItem[] = sets.map((s) => ({
    id: s.id,
    name: s.name,
    primaryBarcode: s.primaryBarcode,
    setSku: s.setSku,
    status: s.status,
    brand: s.brand,
    category: s.category,
    componentCount: s.componentCount,
    availableStock: s.availableStock,
    computedPurchasePrice: s.computedPurchasePrice,
    psf: s.psf ? s.psf.toString() : null,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Set Ürünler"
        description="Sanal setler — bileşenlerden otomatik alış fiyatı, sanal stok, marketplace fiyatları"
        actions={
          <Button asChild>
            <Link href="/set-urun/yeni">
              <Plus className="h-4 w-4" />
              Yeni Set
            </Link>
          </Button>
        }
      />

      {sets.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Henüz set yok"
          description="İlk setini oluştur — bileşenleri seç, ek indirim belirle, otomatik hesaplansın."
          action={
            <Button asChild>
              <Link href="/set-urun/yeni">
                <Plus className="h-4 w-4" />
                Yeni Set
              </Link>
            </Button>
          }
        />
      ) : (
        <SetList sets={setListData} />
      )}
    </div>
  )
}
