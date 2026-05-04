/**
 * Audit Log servisi.
 *
 * Kritik islemler (kullanici CRUD, Trendyol config update, kampanya bitir/tahsilat,
 * basarisiz login) icin kayit yazar. Hata atmaz — log kaydetme isi
 * ana action'i bozmamali.
 */
import { prisma } from "@/lib/db"

export interface WriteAuditLogInput {
  userId?: string | null
  action: string
  entityType?: string
  entityId?: string | number
  before?: unknown
  after?: unknown
  ipAddress?: string
  userAgent?: string
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId != null ? String(input.entityId) : null,
        before: input.before == null ? undefined : (input.before as object),
        after: input.after == null ? undefined : (input.after as object),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (err) {
    console.error("[audit-log] failed:", err)
  }
}
