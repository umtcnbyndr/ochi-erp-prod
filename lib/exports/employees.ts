import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, makeSheet, num } from "./index"

export async function buildEmployeesWorkbook(): Promise<XLSX.WorkBook> {
  const employees = await prisma.employee.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      expenses: {
        where: { category: { in: ["SALARY", "BONUS", "MEAL", "INSURANCE"] } },
        select: {
          expenseDate: true,
          category: true,
          amount: true,
          period: true,
        },
        orderBy: { expenseDate: "desc" },
      },
    },
  })

  // Sheet 1: Personel listesi
  const empRows = employees.map((e) => {
    const totalSalary = e.expenses
      .filter((x) => x.category === "SALARY")
      .reduce((s, x) => s + Number(x.amount), 0)
    const totalBonus = e.expenses
      .filter((x) => x.category === "BONUS")
      .reduce((s, x) => s + Number(x.amount), 0)
    return {
      "İsim": e.name,
      "Pozisyon": e.position ?? "",
      "Aktif": e.isActive ? "Evet" : "Hayır",
      "İşe Başlama": fmtDate(e.hiredAt),
      "Ayrılış": fmtDate(e.leftAt),
      "Toplam Maaş (TL)": totalSalary,
      "Toplam Prim (TL)": totalBonus,
      "Notlar": e.note ?? "",
      "Oluşturulma": fmtDate(e.createdAt),
    }
  })

  // Sheet 2: Maaş/prim ödeme geçmişi
  const paymentRows = employees.flatMap((e) =>
    e.expenses.map((x) => {
      const label: Record<string, string> = {
        SALARY: "Maaş",
        BONUS: "Prim",
        MEAL: "Yemek",
        INSURANCE: "Sigorta",
      }
      return {
        "Personel": e.name,
        "Dönem": x.period,
        "Tarih": fmtDate(x.expenseDate),
        "Tip": label[x.category] ?? x.category,
        "Tutar (TL)": num(x.amount),
      }
    }),
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(empRows, { columnWidths: [20, 18, 8, 12, 12, 14, 14, 30, 12] }),
    "Personel",
  )
  if (paymentRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(paymentRows, { columnWidths: [20, 10, 12, 10, 14] }),
      "Ödeme Geçmişi",
    )
  }
  return wb
}
