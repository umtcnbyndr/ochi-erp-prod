import { redirect } from "next/navigation"
import { getAuthUser } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { RenameFlow } from "./rename-flow"

export const dynamic = "force-dynamic"

export default async function IsimDuzeltmePage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (user.role !== "ADMIN") redirect("/panel")

  return (
    <div className="space-y-4">
      <PageHeader
        title="Toplu Ürün İsmi Düzeltme"
        description="Excel dosyasından (Barkod + Ürün Adı kolonlarıyla) toplu isim güncellemesi. Sadece name alanı değişir, alış/stok/PSF/kategori/marka HİÇBİRİ dokunulmaz."
      />
      <RenameFlow />
    </div>
  )
}
