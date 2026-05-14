"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, PanelLeft, PanelLeftClose, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import { navGroups } from "./nav-items"
import type { UserPermissionMap } from "@/lib/permissions"

interface TopbarProps {
  userName?: string | null
  userEmail?: string | null
  pendingTakasCount?: number
  hasOverdueTakas?: boolean
  permissions?: UserPermissionMap | null
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export function Topbar({
  userName,
  userEmail,
  pendingTakasCount,
  hasOverdueTakas,
  permissions,
  sidebarCollapsed,
  onToggleSidebar,
}: TopbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Tüm nav item'ları href -> label haritasına çevir
  const allItems = navGroups.flatMap((g) => g.items)
  const labelByHref = new Map(allItems.map((i) => [i.href, i.label]))

  // Statik segment label'ları (rota dışı, sadece breadcrumb için)
  const staticSegmentLabels: Record<string, string> = {
    yeni: "Yeni",
    "ice-aktar": "İçe Aktar",
    kullanicilar: "Kullanıcılar",
    "trendyol-form": "Trendyol Ayarları",
  }

  // Pathname'i kümülatif segment'lere böl
  // /urunler/123 -> [{ href: "/urunler", label: "Ürünler" }, { href: "/urunler/123", label: "Detay" }]
  type Crumb = { href: string; label: string; isLast: boolean }
  const crumbs: Crumb[] = (() => {
    if (pathname === "/panel" || pathname === "/") return []
    const segments = pathname.split("/").filter(Boolean)
    const list: Crumb[] = []
    let acc = ""
    segments.forEach((seg, idx) => {
      acc += `/${seg}`
      const isLast = idx === segments.length - 1
      const navLabel = labelByHref.get(acc)
      if (navLabel) {
        list.push({ href: acc, label: navLabel, isLast })
        return
      }
      const staticLabel = staticSegmentLabels[seg]
      if (staticLabel) {
        list.push({ href: acc, label: staticLabel, isLast })
        return
      }
      // Dinamik segment (ID, slug vb.) → "Detay"
      list.push({ href: acc, label: "Detay", isLast })
    })
    return list
  })()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur-md sm:px-4 lg:px-6">
      {/* Mobile menu */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Menüyü aç"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <Sidebar
            onNavigate={() => setMobileOpen(false)}
            userName={userName}
            userEmail={userEmail}
            pendingTakasCount={pendingTakasCount}
            hasOverdueTakas={hasOverdueTakas}
            permissions={permissions}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar toggle */}
      {onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Menüyü aç" : "Menüyü kapat"}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* Breadcrumb — mobilde yatay scroll yapılabilir */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm min-w-0 flex-1 overflow-x-auto scrollbar-none whitespace-nowrap"
      >
        <Link
          href="/panel"
          className="text-muted-foreground transition-colors hover:text-foreground shrink-0"
        >
          Ana Sayfa
        </Link>
        {crumbs.map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-1.5 shrink-0">
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 text-muted-foreground"
            />
            {crumb.isLast ? (
              <span aria-current="page" className="font-medium">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  )
}
