import { PageHeader } from "@/components/common/page-header"
import { ComingSoon } from "@/components/common/coming-soon"

export default function UrunCikisPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Ürün Çıkış" description="Ana depodan çıkış — barkod + adet" />
      <ComingSoon phase="Faz 3" description="Stok düşme işlemi ve stok hareket kaydı." />
    </div>
  )
}
