import { PageHeader } from "@/components/common/page-header"
import { ComingSoon } from "@/components/common/coming-soon"

export default function SetUrunPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Set Ürünler"
        description="Sanal set — bileşenlerden alış, sanal stok, marketplace fiyatları"
      />
      <ComingSoon
        phase="Faz 6"
        description="SKU tabanlı set oluşturma, bileşen seçimi, ek indirim, otomatik satış fiyat hesaplama."
      />
    </div>
  )
}
