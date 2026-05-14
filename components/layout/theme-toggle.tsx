"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { setUserTheme } from "@/app/theme-action"

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  const handleToggle = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark"
    setTheme(next)
    // Fire-and-forget — DB + cookie sync arka planda
    void setUserTheme(next)
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        "relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
      aria-label="Tema değiştir"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute left-1.5 top-1.5 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  )
}
