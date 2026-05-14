import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/utils"
import { getDopigoSnapshotStats } from "./actions"
import { DopigoUploadFlow } from "./upload-flow"
import { Database, FileSpreadsheet, CheckCircle2 } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function DopigoYuklePage() {
  const stats = await getDopigoSnapshotStats()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dopigo Yükleme"
        description="Dopigo'dan dışa aktardığın Excel'i yükle. Sistem barkod/SKU eşleştirmesini günceller, eşleştirme sayfası bu veriyi kullanır."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Mevcut Snapshot</p>
              <Database className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {stats.total.toLocaleString("tr-TR")}
            </p>
            <p className="text-xs text-muted-foreground">Dopigo ürünü</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Barkodlu</p>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {stats.withBarcode.toLocaleString("tr-TR")}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0
                ? `${((stats.withBarcode / stats.total) * 100).toFixed(0)}% barkod doluluğu`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Son Yükleme</p>
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-bold">
              {stats.lastRun ? formatDate(stats.lastRun.uploadedAt) : "Hiç yüklenmedi"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {stats.lastRun?.filename ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upload */}
      <DopigoUploadFlow />

      {/* Sample */}
      {stats.sample.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Örnek Satırlar (ilk 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barkod</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Tedarikçi SKU</TableHead>
                  <TableHead>İsim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.sample.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs py-2">
                      {s.barcode ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs py-2">
                      {s.sku ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs py-2">
                      {s.merchantSku ?? "—"}
                    </TableCell>
                    <TableCell className="truncate max-w-md py-2">{s.name}</TableCell>
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
