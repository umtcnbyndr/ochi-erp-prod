"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Undo2, GitMerge } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { revertMerge } from "../actions"

interface MergeRecord {
  id: number
  sourceProductId: number
  sourceName: string
  sourceBarcode: string
  mergedBarcodes: string[]
  stockTransfer: { mainStock: number; streetStock: number; exchangeStock: number }
  status: "ACTIVE" | "REVERTED"
  mergedAt: string
  revertedAt: string | null
}

interface Props {
  history: MergeRecord[]
}

export function MergeHistorySection({ history }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (history.length === 0) return null

  function handleRevert(id: number, name: string) {
    if (!confirm(`"${name}" birleştirmesi geri alınacak. Ürün tekrar oluşturulacak ve stoklar düşülecek. Devam?`)) return

    startTransition(async () => {
      const result = await revertMerge(id)
      if (result.success) {
        toast.success(`"${result.data!.restoredName}" geri oluşturuldu`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Geri alma başarısız")
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitMerge className="h-4 w-4" />
          Birleştirme Geçmişi
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Eski Ürün</TableHead>
              <TableHead>Barkod</TableHead>
              <TableHead>Taşınan Barkodlar</TableHead>
              <TableHead className="text-right">Stok Aktarımı</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h) => (
              <TableRow
                key={h.id}
                className={h.status === "REVERTED" ? "opacity-50" : ""}
              >
                <TableCell className="font-medium">{h.sourceName}</TableCell>
                <TableCell className="font-mono text-[11px]">{h.sourceBarcode}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {h.mergedBarcodes.map((b) => (
                      <Badge key={b} variant="outline" className="font-mono text-[10px]">
                        {b}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-[12px]">
                  {h.stockTransfer.mainStock > 0 && (
                    <span className="mr-2">Ana: +{h.stockTransfer.mainStock}</span>
                  )}
                  {h.stockTransfer.streetStock > 0 && (
                    <span className="mr-2">Ecz: +{h.stockTransfer.streetStock}</span>
                  )}
                  {h.stockTransfer.exchangeStock > 0 && (
                    <span>Takas: +{h.stockTransfer.exchangeStock}</span>
                  )}
                  {h.stockTransfer.mainStock === 0 &&
                    h.stockTransfer.streetStock === 0 &&
                    h.stockTransfer.exchangeStock === 0 && (
                      <span className="text-muted-foreground">0</span>
                    )}
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">
                  {new Date(h.mergedAt).toLocaleDateString("tr-TR")}
                </TableCell>
                <TableCell>
                  {h.status === "ACTIVE" ? (
                    <Badge variant="default" className="text-[10px]">Aktif</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Geri Alındı</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {h.status === "ACTIVE" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={pending}
                      onClick={() => handleRevert(h.id, h.sourceName)}
                      title="Birleştirmeyi geri al"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
