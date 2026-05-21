import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Calendar } from "lucide-react"
import { requirePermission, getAuthUser } from "@/lib/permissions"
import { getPurchaseOrder } from "@/lib/services/purchase-order"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { OrderActions } from "./order-actions"
import { OrderItems } from "./order-items"

export const dynamic = "force-dynamic"

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  DRAFT: { label: "Taslak", variant: "outline" },
  CONFIRMED: { label: "Bekliyor", variant: "default" },
  PARTIAL: { label: "Kısmen Geldi", variant: "secondary" },
  COMPLETED: { label: "Tamamlandı", variant: "secondary" },
  CANCELLED: { label: "İptal", variant: "destructive" },
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("siparisler", "view")

  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isFinite(id)) notFound()

  const order = await getPurchaseOrder(id)
  if (!order) notFound()

  const brands = await prisma.brand.findMany({
    where: { id: { in: order.brandIds } },
    select: { id: true, name: true },
  })

  const status = STATUS_LABELS[order.status] ?? STATUS_LABELS.DRAFT

  // İlerleme
  const totalOrdered = order.items.reduce((s, i) => s + i.orderedQty, 0)
  const totalReceived = order.items.reduce((s, i) => s + i.receivedQty, 0)
  const progressPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0

  // Serialize for client
  const serializedItems = order.items.map((item) => ({
    ...item,
    listPrice: Number(item.listPrice),
    netPurchasePrice: Number(item.netPurchasePrice),
    dailySalesAvg: Number(item.dailySalesAvg),
    buyboxPrice: item.buyboxPrice ? Number(item.buyboxPrice) : null,
    ourSalePrice: item.ourSalePrice ? Number(item.ourSalePrice) : null,
  }))

  const canReceive = order.status === "CONFIRMED" || order.status === "PARTIAL"
  const authUser = await getAuthUser()
  const isAdmin = authUser?.role === "ADMIN"

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/siparisler">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={`Sipariş #${order.id}`}
          description={`${brands.map((b) => b.name).join(", ")} · ${new Date(order.createdAt).toLocaleDateString("tr-TR")}`}
          actions={<Badge variant={status.variant}>{status.label}</Badge>}
        />
      </div>

      {/* Sipariş bilgileri */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ürün Çeşidi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{order.items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Toplam Adet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{order.totalQuantity}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Liste Toplam
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium tabular-nums">
              {Number(order.totalListAmount).toLocaleString("tr-TR", {
                style: "currency",
                currency: "TRY",
                maximumFractionDigits: 0,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Net Alış (KDV dahil)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {Number(order.totalNetAmount).toLocaleString("tr-TR", {
                style: "currency",
                currency: "TRY",
                maximumFractionDigits: 0,
              })}
            </p>
          </CardContent>
        </Card>
        {/* İlerleme kartı */}
        {order.status !== "DRAFT" && order.status !== "CANCELLED" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Mal Kabul İlerleme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-bold tabular-nums">
                {totalReceived}
                <span className="text-sm font-normal text-muted-foreground">/{totalOrdered}</span>
              </p>
              <Progress value={progressPct} className="h-2" />
              <p className="text-[11px] text-muted-foreground">%{progressPct} tamamlandı</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Aksiyon butonları */}
      <OrderActions orderId={order.id} status={order.status} isAdmin={isAdmin} />

      {/* Not */}
      {order.note && (
        <Card>
          <CardContent className="py-3 text-sm">
            <span className="text-muted-foreground">Not: </span>
            {order.note}
          </CardContent>
        </Card>
      )}

      {/* Kalemler + Mal Kabul */}
      <OrderItems
        orderId={order.id}
        items={serializedItems}
        canReceive={canReceive}
        orderStatus={order.status}
        analysisDays={order.analysisDays}
      />

      {/* Zaman çizelgesi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Zaman Çizelgesi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Timeline label="Sipariş Verildi" date={order.createdAt} active />
          <Timeline label="Onaylandı (Satıcıya Gönderildi)" date={order.confirmedAt} active={!!order.confirmedAt} />
          <Timeline label="Teslim Alındı / Kapatıldı" date={order.completedAt} active={!!order.completedAt} />
          {order.cancelledAt && (
            <Timeline label="İptal Edildi" date={order.cancelledAt} active error />
          )}
          {order.confirmedAt && order.completedAt && (
            <p className="text-xs text-muted-foreground pt-1 pl-5">
              Onaydan teslime: {Math.ceil((new Date(order.completedAt).getTime() - new Date(order.confirmedAt).getTime()) / (1000 * 60 * 60 * 24))} gün
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Timeline({
  label,
  date,
  active,
  error,
}: {
  label: string
  date: Date | null
  active: boolean
  error?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-2 w-2 rounded-full ${
          error ? "bg-red-500" : active ? "bg-primary" : "bg-muted"
        }`}
      />
      <span className={active ? "" : "text-muted-foreground"}>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {date ? new Date(date).toLocaleString("tr-TR") : "—"}
      </span>
    </div>
  )
}
