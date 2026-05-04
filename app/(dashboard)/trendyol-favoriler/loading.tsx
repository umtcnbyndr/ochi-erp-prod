import { Skeleton } from "@/components/ui/skeleton"

export default function TrendyolFavorilerLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Tab list */}
      <div className="flex flex-wrap gap-2 border-b pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-12 gap-3 border-b px-4 py-3">
          <Skeleton className="col-span-5 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-3 h-4" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-3 border-b px-4 py-3 last:border-0">
            <Skeleton className="col-span-5 h-5" />
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-3 h-5" />
          </div>
        ))}
      </div>
    </div>
  )
}
