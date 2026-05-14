"use client"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TakasReceivedFlow } from "./takas-received-flow"
import { TakasGivenFlow } from "./takas-given-flow"
import { PendingList, type PendingExchange } from "./pending-list"
import type { CounterpartyOption } from "./actions"

interface TakasTabsProps {
  counterparties: CounterpartyOption[]
  pending: PendingExchange[]
  isAdmin?: boolean
}

export function TakasTabs({ counterparties, pending, isAdmin = false }: TakasTabsProps) {
  const pendingCount = pending.length

  return (
    <Tabs defaultValue="giris" className="space-y-4">
      <TabsList>
        <TabsTrigger value="giris">Giriş</TabsTrigger>
        <TabsTrigger value="cikis">Çıkış</TabsTrigger>
        <TabsTrigger value="bekleyenler" className="gap-2">
          Bekleyenler
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {pendingCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="giris">
        <TakasReceivedFlow counterparties={counterparties} />
      </TabsContent>

      <TabsContent value="cikis">
        <TakasGivenFlow counterparties={counterparties} />
      </TabsContent>

      <TabsContent value="bekleyenler">
        <PendingList pending={pending} counterparties={counterparties} isAdmin={isAdmin} />
      </TabsContent>
    </Tabs>
  )
}
