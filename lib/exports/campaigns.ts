import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, fmtDateTime, makeSheet, num } from "./index"

export async function buildCampaignsWorkbook(): Promise<XLSX.WorkBook> {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { startDate: "desc" },
    include: {
      brand: { select: { name: true } },
      products: {
        include: { product: { select: { name: true, primaryBarcode: true } } },
      },
      _count: { select: { sales: true } },
    },
  })

  const typeLabel: Record<string, string> = {
    BRAND: "Marka",
    PRODUCTS: "Ürünler",
  }
  const statusLabel: Record<string, string> = {
    ACTIVE: "Aktif",
    ENDED: "Bitti",
    COLLECTED: "Tahsil Edildi",
    CANCELLED: "İptal",
  }

  const campaignRows = campaigns.map((c) => ({
    "ID": c.id,
    "İsim": c.name,
    "Tip": typeLabel[c.type] ?? c.type,
    "Marka": c.brand?.name ?? "",
    "İndirim (%)": num(c.discountRate),
    "Başlangıç": fmtDate(c.startDate),
    "Bitiş": fmtDate(c.endDate),
    "Durum": statusLabel[c.status] ?? c.status,
    "Tahsilat Vadesi": fmtDate(c.collectionDueDate),
    "Tahsil Tarihi": fmtDate(c.collectedAt),
    "İskonto Fatura No": c.collectionInvoiceNo ?? "",
    "Tahsil Tutar (TL)": num(c.collectedAmount) ?? "",
    "Satış Sayısı": c._count.sales,
    "Ürün Sayısı": c.products.length,
    "Notlar": c.notes ?? "",
    "Oluşturulma": fmtDateTime(c.createdAt),
  }))

  // Sheet 2: Kampanyaya dahil ürünler (PRODUCTS tipi için)
  const productRows = campaigns.flatMap((c) =>
    c.products.map((cp) => ({
      "Kampanya": c.name,
      "Ürün": cp.product.name,
      "Barkod": cp.product.primaryBarcode,
    })),
  )

  // Sheet 3: Kampanya satışları (CampaignSale)
  const salesRaw = await prisma.campaignSale.findMany({
    orderBy: { saleDate: "desc" },
    take: 50000,
    include: {
      campaign: { select: { name: true } },
      product: { select: { name: true, primaryBarcode: true } },
    },
  })
  const salesRows = salesRaw.map((s) => ({
    "Kampanya": s.campaign.name,
    "Ürün": s.product.name,
    "Barkod": s.product.primaryBarcode,
    "Adet": s.quantity,
    "PSF Snapshot (TL)": num(s.psfSnapshot) ?? 0,
    "Birim Alış Snapshot (TL)": num(s.unitPurchaseSnapshot) ?? 0,
    "İndirim Tutarı (TL)": num(s.discountAmountTL) ?? 0,
    "Satış Tarihi": fmtDateTime(s.saleDate),
    "Kaynak": s.source,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(campaignRows, {
      columnWidths: [6, 30, 10, 16, 10, 12, 12, 14, 14, 14, 16, 14, 12, 12, 30, 16],
    }),
    "Kampanyalar",
  )
  if (productRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(productRows, { columnWidths: [30, 40, 18] }),
      "Kampanya Ürünleri",
    )
  }
  if (salesRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(salesRows, { columnWidths: [30, 40, 18, 8, 16, 18, 16, 16, 14] }),
      "Kampanya Satışları",
    )
  }
  return wb
}
