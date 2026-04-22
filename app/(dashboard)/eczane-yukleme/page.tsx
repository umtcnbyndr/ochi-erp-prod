import { PageHeader } from "@/components/common/page-header"
import { ComingSoon } from "@/components/common/coming-soon"

export default function EczaneYuklemePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Eczane Veri Yükleme"
        description="Cadde stok + alış fiyatı toplu güncelleme (Excel / CSV)"
      />
      <ComingSoon
        phase="Faz 4"
        description="Kolon eşleştirme, çakışma çözümü, PSF sanity check uyarıları, yükleme logu."
      />
    </div>
  )
}
