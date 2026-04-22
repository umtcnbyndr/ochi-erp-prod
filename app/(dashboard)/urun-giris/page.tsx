import { PageHeader } from "@/components/common/page-header"
import { ComingSoon } from "@/components/common/coming-soon"

export default function UrunGirisPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Ürün Giriş" description="Mal kabul, barkod okutma, ağırlıklı ortalama" />
      <ComingSoon
        phase="Faz 3"
        description="Barkod odaklı giriş ekranı, miad + alış fiyatı + kaynak (satın alma/iade), ürün bazlı + oturum bazlı not."
      />
    </div>
  )
}
