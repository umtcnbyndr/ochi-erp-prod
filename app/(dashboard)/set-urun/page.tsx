import Link from "next/link"
import { Plus, Boxes, Package } from "lucide-react"
import { listSets } from "@/lib/services/set-product"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
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
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function SetUrunPage() {
  const sets = await listSets()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Set Ürünler"
        description="Sanal setler — bileşenlerden otomatik alış fiyatı, sanal stok, marketplace fiyatları"
        actions={
          <Button asChild>
            <Link href="/set-urun/yeni">
              <Plus className="h-4 w-4" />
              Yeni Set
            </Link>
          </Button>
        }
      />

      {sets.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Henüz set yok"
          description="İlk setini oluştur — bileşenleri seç, ek indirim belirle, otomatik hesaplansın."
          action={
            <Button asChild>
              <Link href="/set-urun/yeni">
                <Plus className="h-4 w-4" />
                Yeni Set
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Set Adı</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead className="text-right">Bileşen</TableHead>
                  <TableHead className="text-right">Sanal Stok</TableHead>
                  <TableHead className="text-right">Hesaplanan Alış</TableHead>
                  <TableHead className="text-right">PSF</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sets.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        href={`/set-urun/${s.id}`}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {s.primaryBarcode}
                            {s.setSku ? ` · ${s.setSku}` : ""}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{s.brand.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.componentCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          s.availableStock === 0
                            ? "text-destructive font-semibold"
                            : s.availableStock < 5
                              ? "text-warning font-semibold"
                              : ""
                        }
                      >
                        {s.availableStock}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.computedPurchasePrice > 0
                        ? formatCurrency(s.computedPurchasePrice.toFixed(2))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.psf ? formatCurrency(s.psf.toString()) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.status === "ACTIVE" ? "success" : "outline"}
                      >
                        {s.status === "ACTIVE" ? "Aktif" : "Pasif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
