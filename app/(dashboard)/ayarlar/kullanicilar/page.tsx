import { requirePermission } from "@/lib/permissions"
import { listUsers } from "@/lib/services/user"
import { ALL_MODULES } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { UserList } from "./user-list"

export const dynamic = "force-dynamic"

export default async function KullanicilarPage() {
  await requirePermission("ayarlar", "view")
  const users = await listUsers()

  const serializedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kullanıcı Yönetimi"
        description="Kullanıcı ekle, düzenle ve modül izinlerini yönet"
      />
      <UserList
        users={serializedUsers}
        modules={ALL_MODULES.map((m) => ({ key: m.key, label: m.label }))}
      />
    </div>
  )
}
