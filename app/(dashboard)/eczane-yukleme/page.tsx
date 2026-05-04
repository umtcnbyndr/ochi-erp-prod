import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PharmacyUploadFlow } from "./upload-flow"

export const dynamic = "force-dynamic"

export default async function EczaneYuklemePage() {
  const history = await prisma.pharmacyDataUpload.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 10,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eczane Veri Yükleme"
        description="Cadde stok, alış ve PSF güncelleme. Ana depoya dokunulmaz."
      />

      <PharmacyUploadFlow />

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Son Yüklemeler</CardTitle>
            <CardDescription>En son 10 yükleme</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dosya</TableHead>
                  <TableHead className="text-right">Satır</TableHead>
                  <TableHead className="text-right">Yeni</TableHead>
                  <TableHead className="text-right">Güncellenen</TableHead>
                  <TableHead className="text-right">Atlanan</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs font-mono">{h.filename}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.rowCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {h.newProducts}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.updatedProducts}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {h.skippedRows}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("tr-TR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(h.uploadedAt)}
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
