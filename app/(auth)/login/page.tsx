import { Suspense } from "react"
import { Pill } from "lucide-react"
import { LoginForm } from "./login-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function LoginPage() {
  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Pill className="h-6 w-6" />
        </div>
        <div>
          <CardTitle className="text-2xl">Ochi ERP</CardTitle>
          <CardDescription className="mt-1">
            Eczane yönetim paneline hoş geldiniz
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}

function LoginFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}
