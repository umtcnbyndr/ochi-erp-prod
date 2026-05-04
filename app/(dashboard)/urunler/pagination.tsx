"use client"

import Link from "next/link"
import { useSearchParams, usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  total: number
  page: number
  pageSize: number | "all"
}

export function Pagination({ total, page, pageSize }: Props) {
  const pathname = usePathname()
  const params = useSearchParams()

  function hrefFor(nextPage: number) {
    const sp = new URLSearchParams(params.toString())
    sp.set("page", String(nextPage))
    return `${pathname}?${sp.toString()}`
  }

  if (pageSize === "all") return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const hasPrev = page > 1
  const hasNext = page < totalPages

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="icon-sm" disabled={!hasPrev} asChild={hasPrev}>
        {hasPrev ? (
          <Link href={hrefFor(page - 1)} aria-label="Önceki">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span aria-label="Önceki">
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}
      </Button>
      <span className="px-3 text-sm tabular-nums">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="icon-sm" disabled={!hasNext} asChild={hasNext}>
        {hasNext ? (
          <Link href={hrefFor(page + 1)} aria-label="Sonraki">
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span aria-label="Sonraki">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </div>
  )
}
