import Link from "next/link"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { Users, ChevronRight, AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/common/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TrendyolForm } from "./trendyol-form"

export const dynamic = "force-dynamic"

export default async function AyarlarPage() {
  const session = await auth()

  const [trendyolConfig, userCount] = await Promise.all([
    prisma.trendyolConfig.findUnique({ where: { id: 1 } }),
    prisma.user.count(),
  ])

  // SECURITY: apiSecret asla DOM'a sizdirilmaz. Form, "***" placeholder
  // ile mevcut secret'i korur; degistirmek isterse temizleyip yenisini girer.
  const trendyolInitial = trendyolConfig
    ? {
        supplierId: trendyolConfig.supplierId,
        apiKey: trendyolConfig.apiKey,
        apiSecret: trendyolConfig.apiSecret ? "***" : "",
        environment: (trendyolConfig.environment as "prod" | "stage") ?? "prod",
        isActive: trendyolConfig.isActive,
        lastTestedAt: trendyolConfig.lastTestedAt,
        lastTestOk: trendyolConfig.lastTestOk,
        lastTestNote: trendyolConfig.lastTestNote,
      }
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ayarlar"
        description="Kullanıcı, sistem ve entegrasyon ayarları"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Oturum</CardTitle>
            <CardDescription>Oturum açan kullanıcı bilgileri</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kullanıcı</span>
              <span className="font-medium">{session?.user?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">E-posta</span>
              <span className="font-medium">{session?.user?.email ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Link href="/ayarlar/kullanicilar" className="block">
          <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Kullanıcı Yönetimi
              </CardTitle>
              <CardDescription>
                Kullanıcı ekle, düzenle ve modül izinlerini yönet
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {userCount} kullanıcı
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <TrendyolForm initial={trendyolInitial} />

      {/* Tehlikeli alan — sadece admin */}
      {session?.user?.role === "ADMIN" && (
        <Link href="/ayarlar/sistem-sifirla" className="block">
          <Card className="border-rose-500/30 bg-rose-50/30 dark:bg-rose-950/10 transition-colors hover:bg-rose-50/60 dark:hover:bg-rose-950/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                Sistem Sıfırla (sisteme aktif geçiş)
              </CardTitle>
              <CardDescription>
                Stok hareketleri, mal kabul seansları ve ana alış geçmişini siler. Tüm ürünlerin Ana Stok ve Ana Alış değerleri sıfırlanır. Eczane verisi (Cadde stoğu/alış/PSF) korunur. <strong className="text-rose-700 dark:text-rose-400">GERİ ALINAMAZ.</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                🔒 Sadece admin
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  )
}
