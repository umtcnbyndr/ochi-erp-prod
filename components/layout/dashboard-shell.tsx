"use client"

import { useState, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { ConfirmProvider } from "@/components/common/confirm-provider"
import type { UserPermissionMap } from "@/lib/permissions"

const STORAGE_KEY = "ochi-sidebar-collapsed"

interface DashboardShellProps {
  children: React.ReactNode
  userName?: string | null
  userEmail?: string | null
  pendingTakasCount?: number
  hasOverdueTakas?: boolean
  permissions?: UserPermissionMap | null
}

export function DashboardShell({
  children,
  userName,
  userEmail,
  pendingTakasCount = 0,
  hasOverdueTakas = false,
  permissions,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  // localStorage'dan oku (hydration sonrası)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "true") setCollapsed(true)
  }, [])

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  return (
    <ConfirmProvider>
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden lg:block lg:shrink-0 transition-[width] duration-200 ease-in-out",
          collapsed ? "lg:w-0" : "lg:w-56"
        )}
      >
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-56 border-r bg-card transition-transform duration-200 ease-in-out",
            collapsed ? "-translate-x-full" : "translate-x-0"
          )}
        >
          <Sidebar
            userName={userName}
            userEmail={userEmail}
            pendingTakasCount={pendingTakasCount}
            hasOverdueTakas={hasOverdueTakas}
            permissions={permissions}
          />
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-h-dvh flex-1 flex-col min-w-0">
        <Topbar
          userName={userName}
          userEmail={userEmail}
          pendingTakasCount={pendingTakasCount}
          hasOverdueTakas={hasOverdueTakas}
          permissions={permissions}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
        />
        <main className="flex-1 overflow-x-auto">
          <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
    </ConfirmProvider>
  )
}
