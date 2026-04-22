import { auth } from "@/auth"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:w-64 lg:shrink-0">
        <div className="fixed inset-y-0 left-0 w-64">
          <Sidebar />
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-h-dvh flex-1 flex-col">
        <Topbar
          userName={session?.user?.name}
          userEmail={session?.user?.email}
        />
        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
