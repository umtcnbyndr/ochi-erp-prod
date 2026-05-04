import { PageHeader } from "@/components/common/page-header"
import { ExitFlow } from "./exit-flow"

export const dynamic = "force-dynamic"

export default function UrunCikisPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ürün Çıkış"
        description="Ana depodan çıkış — barkod okutun, miktar girin, tamamlayın"
      />
      <ExitFlow />
    </div>
  )
}
