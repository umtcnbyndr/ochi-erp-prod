import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { getUserTheme } from "./theme-action"

export const metadata: Metadata = {
  title: "Ochi ERP",
  description: "Eczane ERP sistemi — ürün yönetimi, stok, takas, pazar yeri entegrasyonu",
  applicationName: "Ochi ERP",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialTheme = await getUserTheme()

  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ThemeProvider initialTheme={initialTheme}>
          <TooltipProvider delayDuration={200}>
            {children}
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
