import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { getAuthUser } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { ResetFlow } from "./reset-flow"

export const dynamic = "force-dynamic"

export default async function SistemSifirlaPage() {
  const user = await getAuthUser()
  if (!user || user.role !== "ADMIN") redirect("/ayarlar")

  // Mevcut sayılar — kullanıcı silmeden önce ne kadar veri etkileneceğini görsün
  const [stockMovementCount, entrySessionCount, priceHistoryCount, productCount, totalMainStock] =
    await Promise.all([
      prisma.stockMovement.count(),
      prisma.entrySession.count(),
      prisma.priceHistory.count({ where: { priceType: "MAIN_PURCHASE" } }),
      prisma.product.count(),
      prisma.product.aggregate({ _sum: { mainStock: true } }),
    ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="⚠️ Sistem Sıfırla"
        description="Ana depo geçmişini ve stok/alış kayıtlarını temizler — sisteme aktif geçişten önce bir kez kullanılır"
      />
      <ResetFlow
        stats={{
          stockMovementCount,
          entrySessionCount,
          priceHistoryCount,
          productCount,
          totalMainStock: totalMainStock._sum.mainStock ?? 0,
        }}
      />
    </div>
  )
}
