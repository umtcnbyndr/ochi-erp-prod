import { PageHeader } from "@/components/common/page-header"
import { ComingSoon } from "@/components/common/coming-soon"

export default function StokHareketleriPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Stok Hareketleri"
        description="Tüm giriş / çıkış / takas kayıtlarının ledger'ı"
      />
      <ComingSoon phase="Faz 3" description="Filtrelenebilir tam ledger görünümü." />
    </div>
  )
}
