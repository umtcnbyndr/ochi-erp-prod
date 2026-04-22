import { auth } from "@/auth"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AyarlarPage() {
  const session = await auth()
  return (
    <div className="space-y-6">
      <PageHeader title="Ayarlar" description="Kullanıcı, sistem, entegrasyon ayarları" />
      <Card>
        <CardHeader>
          <CardTitle>Kullanıcı</CardTitle>
          <CardDescription>Oturum açan kullanıcı bilgileri</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">E-posta</span>
            <span className="font-medium">{session?.user?.email ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">İsim</span>
            <span className="font-medium">{session?.user?.name ?? "—"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
