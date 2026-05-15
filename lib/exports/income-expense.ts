import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, fmtDateTime, makeSheet, num } from "./index"
import {
  CATEGORY_LABELS,
  PERIODICITY_LABELS,
  getYearlyExpenseMatrix,
} from "@/lib/services/expense"

const MONTH_NAMES = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
]

export async function buildIncomeExpenseWorkbook(): Promise<XLSX.WorkBook> {
  const currentYear = new Date().getFullYear()

  // 3 yıl: önceki, mevcut, sonraki (eğer veri varsa)
  const yearsToInclude = [currentYear - 1, currentYear, currentYear + 1].filter((y) => y >= 2025)

  const [expenses, snapshots, monthlyMatrices] = await Promise.all([
    prisma.expense.findMany({
      orderBy: { expenseDate: "desc" },
      include: { employee: { select: { name: true } } },
    }),
    prisma.monthlySalesSnapshot.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    Promise.all(yearsToInclude.map((y) => getYearlyExpenseMatrix(y))),
  ])

  // Sheet 1: Giderler (detaylı)
  const expenseRows = expenses.map((e) => ({
    "ID": e.id,
    "Tarih": fmtDate(e.expenseDate),
    "Dönem": e.period,
    "Kategori": CATEGORY_LABELS[e.category] ?? e.category,
    "Özel Kategori": e.customCategory ?? "",
    "Tutar (TL)": num(e.amount) ?? 0,
    "Periyot": PERIODICITY_LABELS[e.periodicity] ?? e.periodicity,
    "Personel": e.employee?.name ?? "",
    "Vendor": e.vendor ?? "",
    "Fatura No": e.invoiceNumber ?? "",
    "Açıklama": e.description ?? "",
    "Not": e.note ?? "",
    "Oluşturulma": fmtDateTime(e.createdAt),
  }))

  // Sheet 2: Aylık Satış Snapshot
  const snapRows = snapshots.map((s) => ({
    "Yıl": s.year,
    "Ay": MONTH_NAMES[s.month - 1] ?? s.month,
    "Gelir (TL)": num(s.revenue) ?? 0,
    "Alış Maliyet (TL)": num(s.cost) ?? 0,
    "Komisyon (TL)": num(s.commission) ?? 0,
    "Kargo (TL)": num(s.shipping) ?? 0,
    "Stopaj (TL)": num(s.withholding) ?? 0,
    "Kaynak": s.isManual ? "Manuel" : "Dopigo",
    "Not": s.note ?? "",
    "Güncelleme": fmtDateTime(s.updatedAt),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(expenseRows, {
      columnWidths: [6, 12, 10, 18, 18, 14, 12, 18, 18, 14, 30, 30, 16],
    }),
    "Giderler",
  )
  if (snapRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(snapRows, {
        columnWidths: [6, 8, 14, 14, 14, 12, 12, 10, 30, 16],
      }),
      "Aylık Snapshot",
    )
  }

  // Sheet 3+: Yıllık Pivot (her yıl için)
  for (let i = 0; i < yearsToInclude.length; i++) {
    const year = yearsToInclude[i]
    const matrix = monthlyMatrices[i]
    if (matrix.grandTotal === 0) continue

    // Pivot tablo: Kategori × Ay
    const header = ["Kategori", ...MONTH_NAMES, "Yıllık"]
    const rows: (string | number)[][] = [header]

    const cats = Object.keys(matrix.byCategory)
    for (const cat of cats) {
      const monthData = matrix.byCategory[cat as keyof typeof matrix.byCategory]
      const row: (string | number)[] = [
        CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat,
      ]
      for (let m = 1; m <= 12; m++) {
        row.push(monthData[m] ?? 0)
      }
      row.push(matrix.categoryTotal[cat as keyof typeof matrix.categoryTotal] ?? 0)
      rows.push(row)
    }

    // Toplam satırı
    const totalRow: (string | number)[] = ["TOPLAM"]
    for (let m = 1; m <= 12; m++) {
      totalRow.push(matrix.monthlyTotal[m] ?? 0)
    }
    totalRow.push(matrix.grandTotal)
    rows.push(totalRow)

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws["!cols"] = [
      { wch: 18 },
      ...Array(12).fill({ wch: 12 }),
      { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, `Pivot ${year}`)
  }

  return wb
}
