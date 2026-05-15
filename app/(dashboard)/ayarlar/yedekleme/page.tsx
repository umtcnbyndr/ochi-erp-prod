import { redirect } from "next/navigation"
import { getAuthUser } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { getModulesByGroup } from "@/lib/exports"
import { YedeklemeFlow } from "./yedekleme-flow"

export const dynamic = "force-dynamic"

export default async function YedeklemePage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (user.role !== "ADMIN") redirect("/panel")

  const groups = getModulesByGroup()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sistem Yedekleme"
        description="Tüm sistem verilerini Excel olarak indir. Herhangi bir modülü ayrı ayrı veya tümünü ZIP olarak alabilirsin."
      />

      <YedeklemeFlow
        groups={Object.entries(groups).map(([title, mods]) => ({
          title,
          modules: mods.map((m) => ({
            key: m.key,
            label: m.label,
            filename: m.filename,
            description: m.description ?? "",
          })),
        }))}
      />
    </div>
  )
}
