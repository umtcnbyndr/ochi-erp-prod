"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

type Tab = "active" | "collection" | "history"

interface Campaign {
  id: number
  name: string
  type: "BRAND" | "PRODUCTS"
  brandId: number | null
  brandName: string | null
  discountRate: number
  startDate: string
  endDate: string
  status: "ACTIVE" | "ENDED" | "COLLECTED" | "CANCELLED"
  collectionDueDate: string | null
  collectedAt: string | null
  collectionInvoiceNo: string | null
  collectedAmount: number | null
  notes: string | null
  createdAt: string
  endedAt: string | null
  productCount: number
  saleCount: number
  totalDiscountTL: number
  totalQuantity: number
}

interface Props {
  campaigns: Campaign[]
}

const STATUS_LABELS: Record<
  Campaign["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  ACTIVE: { label: "Aktif", variant: "default" },
  ENDED: { label: "Bitti — Tahsilat Bekleniyor", variant: "secondary" },
  COLLECTED: { label: "Tahsil Edildi", variant: "outline" },
  CANCELLED: { label: "İptal", variant: "destructive" },
}

export function CampaignList({ campaigns }: Props) {
  const [tab, setTab] = useState<Tab>("active")

  const grouped = useMemo(() => {
    const active = campaigns.filter((c) => c.status === "ACTIVE")
    const collection = campaigns.filter((c) => c.status === "ENDED")
    const history = campaigns.filter(
      (c) => c.status === "COLLECTED" || c.status === "CANCELLED",
    )
    return { active, collection, history }
  }, [campaigns])

  const filtered =
    tab === "active"
      ? grouped.active
      : tab === "collection"
      ? grouped.collection
      : grouped.history

  // Tahsilat deadline yaklaşan?
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000

  return (
    <>
      {/* Tab filtreleri */}
      <div className="flex gap-1 border-b pb-0">
        <TabButton
          active={tab === "active"}
          onClick={() => setTab("active")}
          count={grouped.active.length}
          icon={<Megaphone className="h-3.5 w-3.5" />}
        >
          Aktif
        </TabButton>
        <TabButton
          active={tab === "collection"}
          onClick={() => setTab("collection")}
          count={grouped.collection.length}
          icon={<Clock className="h-3.5 w-3.5" />}
          highlight={grouped.collection.some(
            (c) =>
              c.collectionDueDate &&
              new Date(c.collectionDueDate).getTime() - now <= sevenDays,
          )}
        >
          Tahsilat Bekleyen
        </TabButton>
        <TabButton
          active={tab === "history"}
          onClick={() => setTab("history")}
          count={grouped.history.length}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        >
          Geçmiş
        </TabButton>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead>Tip / Kapsam</TableHead>
                <TableHead className="text-right">İndirim</TableHead>
                <TableHead>Tarih Aralığı</TableHead>
                <TableHead className="text-center">Ürün</TableHead>
                <TableHead className="text-center">Satış</TableHead>
                <TableHead className="text-right">Tahsilat (TL)</TableHead>
                <TableHead className="text-center">Durum</TableHead>
                {tab === "collection" && (
                  <TableHead className="text-center">Deadline</TableHead>
                )}
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tab === "collection" ? 10 : 9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Megaphone className="h-12 w-12 opacity-30" />
                      <div>
                        {tab === "active"
                          ? "Aktif kampanya yok"
                          : tab === "collection"
                          ? "Tahsil edilmeyi bekleyen kampanya yok"
                          : "Geçmiş kampanya yok"}
                      </div>
                      {tab === "active" && (
                        <Link href="/kampanyalar/yeni">
                          <Button size="sm">İlk Kampanyayı Oluştur</Button>
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const dueDate = c.collectionDueDate
                    ? new Date(c.collectionDueDate)
                    : null
                  const dueSoon =
                    dueDate &&
                    dueDate.getTime() - now <= sevenDays &&
                    dueDate.getTime() >= now
                  const overdue = dueDate && dueDate.getTime() < now

                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        window.location.href = `/kampanyalar/${c.id}`
                      }}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-[12px]">
                        {c.type === "BRAND" ? (
                          <span>
                            <Badge variant="outline" className="text-[10px] mr-1.5">
                              Marka
                            </Badge>
                            {c.brandName ?? "—"}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Ürün listesi ({c.productCount})
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        %{c.discountRate.toFixed(2).replace(".", ",")}
                      </TableCell>
                      <TableCell className="text-[12px] whitespace-nowrap text-muted-foreground">
                        {new Date(c.startDate).toLocaleDateString("tr-TR")}
                        <span className="mx-1">→</span>
                        {new Date(c.endDate).toLocaleDateString("tr-TR")}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {c.productCount}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {c.saleCount > 0 ? (
                          <span>
                            {c.saleCount}
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({c.totalQuantity} adet)
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {c.totalDiscountTL > 0 ? (
                          c.totalDiscountTL.toLocaleString("tr-TR", {
                            style: "currency",
                            currency: "TRY",
                            maximumFractionDigits: 0,
                          })
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={STATUS_LABELS[c.status].variant}
                          className="text-[10px]"
                        >
                          {STATUS_LABELS[c.status].label}
                        </Badge>
                      </TableCell>
                      {tab === "collection" && (
                        <TableCell className="text-center text-[12px]">
                          {dueDate ? (
                            <span
                              className={
                                overdue
                                  ? "text-red-600 font-semibold"
                                  : dueSoon
                                  ? "text-amber-600 font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {overdue && (
                                <AlertCircle className="inline h-3 w-3 mr-1" />
                              )}
                              {dueDate.toLocaleDateString("tr-TR")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Link
                          href={`/kampanyalar/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Detay
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function TabButton({
  active,
  onClick,
  count,
  icon,
  highlight,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  icon?: React.ReactNode
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
      <Badge
        variant={active ? "default" : highlight ? "destructive" : "outline"}
        className="text-[10px] ml-1 h-5 min-w-5 justify-center"
      >
        {count}
      </Badge>
    </button>
  )
}
