import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default function YetkisizPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
            <ShieldAlert className="h-7 w-7 text-red-600" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Yetkiniz yok</h1>
            <p className="text-sm text-muted-foreground">
              Bu sayfaya erişim izniniz bulunmuyor. Erişim gerekiyorsa yöneticinizle
              iletişime geçin.
            </p>
            <p className="text-xs text-muted-foreground">
              Daha önce erişebiliyorduysanız: güvenlik güncellemesi sonrası bir kez
              <strong> çıkış yapıp tekrar giriş</strong> yapın.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">
              Panele dön
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
