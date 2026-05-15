import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDateTime, makeSheet } from "./index"

export async function buildUsersWorkbook(): Promise<XLSX.WorkBook> {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
    include: { permissions: true },
  })

  const userRows = users.map((u) => ({
    "Kullanıcı Adı": u.username,
    "Email": u.email,
    "İsim": u.name ?? "",
    "Rol": u.role,
    "Aktif": u.isActive ? "Evet" : "Hayır",
    "Tema Tercihi": u.themePreference,
    "Email Doğrulandı": u.emailVerified ? fmtDateTime(u.emailVerified) : "",
    "Oluşturulma": fmtDateTime(u.createdAt),
    "İzin Sayısı": u.permissions.length,
  }))

  const permRows = users.flatMap((u) =>
    u.permissions.map((p) => ({
      "Kullanıcı": u.username,
      "Modül": p.module,
      "Görme": p.canView ? "Evet" : "Hayır",
      "Düzenleme": p.canEdit ? "Evet" : "Hayır",
    })),
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(userRows, { columnWidths: [16, 28, 20, 10, 8, 12, 16, 16, 10] }),
    "Kullanıcılar",
  )
  if (permRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(permRows, { columnWidths: [16, 22, 10, 12] }),
      "İzinler",
    )
  }
  return wb
}
