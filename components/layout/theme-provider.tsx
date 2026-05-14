"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

interface ThemeProviderProps {
  children: React.ReactNode
  /** Server'dan gelen başlangıç teması — kullanıcı/cookie bazlı */
  initialTheme?: "light" | "dark" | "system"
}

export function ThemeProvider({ children, initialTheme = "system" }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={initialTheme}
      enableSystem
      disableTransitionOnChange
      storageKey="ochi-theme-local"
    >
      {children}
    </NextThemesProvider>
  )
}
