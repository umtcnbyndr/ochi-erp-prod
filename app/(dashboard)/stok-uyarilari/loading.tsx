import { Loader2 } from "lucide-react"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Stok Uyarıları"
        description="Sistem efektif stoğu vs Dopigo depot stoğu."
      />
      <Card>
        <CardContent className="p-10 flex flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Dopigo'dan tüm ürünler çekiliyor...</p>
          <p className="text-xs text-muted-foreground max-w-md">
            ~2.500+ ürün için Dopigo API paginasyon yapılıyor.
            İlk yüklemede 5-10 saniye sürebilir.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
