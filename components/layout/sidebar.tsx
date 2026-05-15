"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Pill, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { navGroups, type NavItem } from "./nav-items"
import type { UserPermissionMap } from "@/lib/permissions"
import { logoutAction } from "@/app/(dashboard)/logout-action"

interface SidebarProps {
  onNavigate?: () => void
  className?: string
  userName?: string | null
  userEmail?: string | null
  /** Bekleyen takas sayısı — /takas linkinde badge olarak gösterilir */
  pendingTakasCount?: number
  /** 7+ gün bekleyen takas var mı — badge'i kırmızıya çevirir */
  hasOverdueTakas?: boolean
  /** Vadesi geçen + yaklaşan fatura sayısı — /finans/faturalar badge'i */
  invoiceAlertCount?: number
  /** Vadesi geçen fatura var mı — kırmızı yapar */
  hasOverdueInvoices?: boolean
  /** Stok uyarısı sayısı (CRITICAL + RISKY) — /stok-uyarilari badge'i */
  stockAlertCount?: number
  /** CRITICAL var mı — kırmızı yapar */
  hasCriticalStock?: boolean
  /** Kullanıcı izinleri — null ise tüm menüler gösterilir (ADMIN) */
  permissions?: UserPermissionMap | null
}

export function Sidebar({
  onNavigate,
  className,
  userName,
  userEmail,
  pendingTakasCount = 0,
  hasOverdueTakas = false,
  invoiceAlertCount = 0,
  hasOverdueInvoices = false,
  stockAlertCount = 0,
  hasCriticalStock = false,
  permissions,
}: SidebarProps) {
  const pathname = usePathname()

  /** İzin kontrolü: permissions null/undefined ise her şeyi göster (ADMIN) */
  function isVisible(item: NavItem): boolean {
    if (!permissions) return true
    const perm = permissions[item.moduleKey]
    return perm?.canView ?? false
  }

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-r bg-card",
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Pill className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-wide">OCHİ HEALTH</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            ERP Sistemi
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-3 py-4">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(isVisible)
          if (visibleItems.length === 0) return null

          return (
            <div key={group.title} className="space-y-0.5">
              <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              {visibleItems.map((item) => {
                // Aktif kontrol: tam eşleşme veya sub-path (/.../).
                // Daha spesifik bir item varsa (örn. /ayarlar/yedekleme), parent (/ayarlar) aktif olmasın.
                const isExact = pathname === item.href
                const isSubPath =
                  item.href !== "/panel" && pathname.startsWith(item.href + "/")
                const hasMoreSpecific =
                  isSubPath &&
                  visibleItems.some(
                    (other) =>
                      other.href !== item.href &&
                      other.href.startsWith(item.href + "/") &&
                      (pathname === other.href || pathname.startsWith(other.href + "/")),
                  )
                const active = isExact || (isSubPath && !hasMoreSpecific)
                const Icon = item.icon
                // Dinamik badge'ler
                const dynamicBadge =
                  item.href === "/takas" && pendingTakasCount > 0
                    ? String(pendingTakasCount)
                    : item.href === "/finans/faturalar" && invoiceAlertCount > 0
                      ? String(invoiceAlertCount)
                      : item.href === "/stok-uyarilari" && stockAlertCount > 0
                        ? String(stockAlertCount)
                        : null
                const badgeText = dynamicBadge ?? item.badge
                const takasOverdue = item.href === "/takas" && hasOverdueTakas
                const invoiceOverdue = item.href === "/finans/faturalar" && hasOverdueInvoices
                const stockCritical = item.href === "/stok-uyarilari" && hasCriticalStock
                const isOverdue = takasOverdue || invoiceOverdue || stockCritical
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-all",
                      active
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground hover:translate-x-0.5"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-primary-foreground" />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active
                          ? "text-primary-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {badgeText && (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                          isOverdue
                            ? active
                              ? "bg-destructive text-destructive-foreground ring-1 ring-destructive/30"
                              : "bg-destructive text-destructive-foreground"
                            : active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {badgeText}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      {(userName || userEmail) && (
        <div className="shrink-0 border-t p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {getInitials(userName || userEmail || "?")}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{userName ?? "Kullanıcı"}</p>
              {userEmail && (
                <p className="truncate text-[10px] text-muted-foreground">{userEmail}</p>
              )}
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Çıkış yap"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}

function getInitials(s: string): string {
  const parts = s.split(/[\s@]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}
