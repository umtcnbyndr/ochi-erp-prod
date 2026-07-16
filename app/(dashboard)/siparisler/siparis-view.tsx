"use client"

import type { ComponentProps } from "react"
import { ClipboardList, TrendingUp } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OrderList } from "./order-list"
import { PazarFirsatiTable, type OrderOpportunity } from "./pazar-firsati-table"

/**
 * Siparişler görünümü: "Siparişler" listesi + "Pazar Fırsatı" sekmesi.
 * Pazar Fırsatı = scraper motorunun ORDER önerileri (elimizde yok + kârlı → markadan al).
 */
export function SiparisView({
  opportunities,
  ...orderListProps
}: ComponentProps<typeof OrderList> & { opportunities: OrderOpportunity[] }) {
  return (
    <Tabs defaultValue="orders" className="w-full">
      <TabsList>
        <TabsTrigger value="orders" className="gap-1.5">
          <ClipboardList className="h-4 w-4" />
          Siparişler
        </TabsTrigger>
        <TabsTrigger value="pazar" className="gap-1.5">
          <TrendingUp className="h-4 w-4" />
          Pazar Fırsatı ({opportunities.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="orders" className="mt-4">
        <OrderList {...orderListProps} />
      </TabsContent>
      <TabsContent value="pazar" className="mt-4">
        <PazarFirsatiTable rows={opportunities} />
      </TabsContent>
    </Tabs>
  )
}
