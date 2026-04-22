import Link from "next/link"
import {
  Package,
  PackagePlus,
  PackageMinus,
  Repeat2,
  Upload,
  ArrowRight,
  Store,
  Tags,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

async function getStats() {
  const [productCount, brandCount, marketplaceCount, lowStockCount] =
    await Promise.all([
      prisma.product.count({ where: { status: "ACTIVE" } }).catch(() => 0),
      prisma.brand.count().catch(() => 0),
      prisma.marketplace.count({ where: { isActive: true } }).catch(() => 0),
      prisma.product
        .count({
          where: {
            status: "ACTIVE",
            AND: [{ minStock: { gt: 0 } }],
          },
        })
        .catch(() => 0),
    ])
  return { productCount, brandCount, marketplaceCount, lowStockCount }
}

export default async function DashboardPage() {
  const stats = await getStats()

  const quickActions = [
    { href: "/urun-giris", icon: PackagePlus, label: "Ürün Giriş", color: "bg-emerald-500" },
    { href: "/urun-cikis", icon: PackageMinus, label: "Ürün Çıkış", color: "bg-rose-500" },
    { href: "/takas", icon: Repeat2, label: "Takas", color: "bg-amber-500" },
    { href: "/eczane-yukleme", icon: Upload, label: "Eczane Yükle", color: "bg-sky-500" },
  ]

  const statCards = [
    { label: "Aktif Ürün", value: stats.productCount, icon: Package, href: "/urunler" },
    { label: "Marka", value: stats.brandCount, icon: Tags, href: "/markalar" },
    { label: "Pazar Yeri", value: stats.marketplaceCount, icon: Store, href: "/marketplaces" },
    { label: "Düşük Stok", value: stats.lowStockCount, icon: Package, href: "/urunler?filter=low-stock" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Panel</h1>
          <p className="text-sm text-muted-foreground">
            Ochi ERP — Eczane yönetim paneli
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4 sm:p-5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
                      {stat.value}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted sm:h-12 sm:w-12">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Hızlı İşlemler</CardTitle>
          <CardDescription>
            Sık kullanılan işlemlere tek tıkla erişin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link key={action.href} href={action.href}>
                  <div className="group flex flex-col items-center gap-2 rounded-xl border p-4 transition-all hover:border-primary/40 hover:shadow-sm sm:gap-3 sm:p-6">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-lg ${action.color} text-white shadow-sm sm:h-12 sm:w-12`}
                    >
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <span className="text-center text-xs font-medium sm:text-sm">
                      {action.label}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Next steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Sonraki Adımlar</CardTitle>
          <CardDescription>Sistem kurulumu için yapılması gerekenler</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StepItem
            step={1}
            title="Markaları tanımla"
            description="İskonto oranları, eczane stok kuralı, distribütör bilgileri"
            href="/markalar"
          />
          <StepItem
            step={2}
            title="Kategori yapısını kur"
            description="2 seviye: Kategori + Alt Kategori"
            href="/kategoriler"
          />
          <StepItem
            step={3}
            title="Pazar yerlerini yapılandır"
            description="Trendyol, Hepsiburada, Kendi Site — komisyon, kargo, stopaj, hedef kar"
            href="/marketplaces"
          />
          <StepItem
            step={4}
            title="Cari listesini oluştur"
            description="Takas için karşı taraf kayıtları"
            href="/cariler"
          />
        </CardContent>
      </Card>
    </div>
  )
}

function StepItem({
  step,
  title,
  description,
  href,
}: {
  step: number
  title: string
  description: string
  href: string
}) {
  return (
    <Link href={href}>
      <div className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent sm:gap-4 sm:p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground sm:h-10 sm:w-10">
          {step}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium sm:text-base">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
            {description}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}
