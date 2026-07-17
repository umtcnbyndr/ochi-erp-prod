"use client"

import { type ReactNode } from "react"
import { Megaphone, ShieldHalf } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

interface Props {
  campaignCount: number
  activeCampaignCount: number
  aktarFlow: ReactNode
  campaignSection: ReactNode
  tyFloorSection: ReactNode
}

export function AktarTabs({
  campaignCount,
  activeCampaignCount,
  aktarFlow,
  campaignSection,
  tyFloorSection,
}: Props) {
  return (
    <Tabs defaultValue="urun-aktar">
      <TabsList>
        <TabsTrigger value="urun-aktar">Ürün Aktarım</TabsTrigger>
        <TabsTrigger value="kampanyalar" className="gap-1.5">
          <Megaphone className="h-3.5 w-3.5" />
          Kampanyalar
          {campaignCount > 0 && (
            <Badge
              variant="secondary"
              className={
                activeCampaignCount > 0
                  ? "ml-1 h-5 min-w-5 px-1 text-[10px] bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"
                  : "ml-1 h-5 min-w-5 px-1 text-[10px]"
              }
            >
              {campaignCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="ty-floor" className="gap-1.5">
          <ShieldHalf className="h-3.5 w-3.5" />
          Kâr Tabanı
        </TabsTrigger>
      </TabsList>

      <TabsContent value="urun-aktar">{aktarFlow}</TabsContent>
      <TabsContent value="kampanyalar">{campaignSection}</TabsContent>
      <TabsContent value="ty-floor">{tyFloorSection}</TabsContent>
    </Tabs>
  )
}
