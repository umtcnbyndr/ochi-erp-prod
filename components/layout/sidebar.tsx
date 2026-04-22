"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Pill } from "lucide-react"
import { cn } from "@/lib/utils"
import { navGroups } from "./nav-items"

interface SidebarProps {
  onNavigate?: () => void
  className?: string
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-r bg-card",
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Pill className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Ochi ERP</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Eczane
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto scrollbar-thin px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/panel" && pathname.startsWith(item.href))
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t p-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Faz 1 — MVP</p>
          <p className="mt-1">Temel altyapı kuruldu, ürün modülü geliştiriliyor.</p>
        </div>
      </div>
    </aside>
  )
}
