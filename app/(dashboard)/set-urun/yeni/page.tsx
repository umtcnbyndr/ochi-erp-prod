import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/db"
import { SetForm } from "../set-form"

export const dynamic = "force-dynamic"

export default async function YeniSetPage() {
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subcategories: {
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
  ])

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/set-urun"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Setler
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          Yeni Set
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bileşen seç, ek indirim belirle — alış fiyatı ve sanal stok otomatik
          hesaplanır.
        </p>
      </div>

      <SetForm brands={brands} categories={categories} />
    </div>
  )
}
