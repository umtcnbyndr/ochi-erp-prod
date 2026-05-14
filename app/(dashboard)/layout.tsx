import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { getUserPermissions, type UserPermissionMap } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Bekleyen takas özeti (sidebar badge + uyarı için)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Kullanıcı izinlerini çek (ADMIN ise null — tüm menüler açık)
  let permissions: UserPermissionMap | null = null
  const userId = session?.user?.id
  const userRole = (session?.user as { role?: string } | undefined)?.role

  const now = new Date()
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [pendingTakasCount, overdueTakasCount, overdueInvoiceCount, dueSoonInvoiceCount] =
    await Promise.all([
      prisma.exchange.count({ where: { status: "PENDING" } }),
      prisma.exchange.count({
        where: { status: "PENDING", createdAt: { lte: sevenDaysAgo } },
      }),
      prisma.purchaseInvoice.count({
        where: {
          discountStatus: { in: ["OPEN", "PARTIAL"] },
          discountDueDate: { not: null, lt: now },
        },
      }),
      prisma.purchaseInvoice.count({
        where: {
          discountStatus: { in: ["OPEN", "PARTIAL"] },
          discountDueDate: { not: null, gte: now, lte: sevenDaysAhead },
        },
      }),
    ]).catch(() => [0, 0, 0, 0] as const)

  const hasOverdueTakas = overdueTakasCount > 0
  const invoiceAlertCount = overdueInvoiceCount + dueSoonInvoiceCount
  const hasOverdueInvoices = overdueInvoiceCount > 0

  // ADMIN olmayan kullanıcılar için izinleri yükle
  if (userId && userRole !== "ADMIN") {
    permissions = await getUserPermissions(userId)
  }

  return (
    <DashboardShell
      userName={session?.user?.name}
      userEmail={session?.user?.email}
      pendingTakasCount={pendingTakasCount}
      hasOverdueTakas={hasOverdueTakas}
      invoiceAlertCount={invoiceAlertCount}
      hasOverdueInvoices={hasOverdueInvoices}
      permissions={permissions}
    >
      {children}
    </DashboardShell>
  )
}
