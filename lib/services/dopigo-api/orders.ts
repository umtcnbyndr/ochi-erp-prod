/**
 * Dopigo Orders API — sipariş listesi ve tek sipariş çekme.
 *
 * Endpoint: GET /api/v1/orders/
 * Pagination: count, next, previous, results[]
 * Tarih filtresi: service_date_after / service_date_before (YYYY-MM-DD)
 * Diğer: status, sales_channel (virgülle çoklu), limit (max 100), offset
 */
import { dopigoGet, type DopigoCredentials } from "./client"

// ===== Tipler =====

export interface DopigoApiAddress {
  id: number
  full_address?: string | null
  contact_full_name?: string | null
  contact_phone_number?: string | null
  country?: string | null
  city?: string | null
  district?: string | null
  zip_code?: string | null
  email?: string | null
  company_name?: string | null
}

export interface DopigoApiCustomer {
  id: number
  account_type?: string | null
  full_name?: string | null
  email?: string | null
  phone_number?: string | null
  citizen_id?: string | number | null
  tax_id?: string | null
  tax_office?: string | null
  company_name?: string | null
  address?: DopigoApiAddress | null
}

export interface DopigoApiLinkedProduct {
  id: number
  sku?: string | null
  foreign_sku?: string | null
  second_foreign_sku?: string | null
  barcode?: string | null
}

export interface DopigoApiOrderItem {
  id: number
  order: number
  service_item_id?: string | null
  service_product_id?: string | null
  sku?: string | null
  attributes?: string | null
  name: string
  amount: number
  price: string // Decimal as string
  unit_price?: string | null
  shipment_campaign_code?: string | null
  buyer_pays_shipment?: boolean | null
  status?: string | null
  shipment_provider?: number | null
  tax_ratio?: number | null
  product?: number | null
  linked_product?: DopigoApiLinkedProduct | null
  vat?: string | null
}

export interface DopigoApiOrder {
  id: number
  service: number
  service_name: string
  service_logo?: string | null
  sales_channel: string
  service_created: string // ISO timestamp
  service_value?: string | null
  service_order_id?: string | null
  products?: string | null // text özet
  customer?: DopigoApiCustomer | null
  billing_address?: DopigoApiAddress | null
  shipping_address?: DopigoApiAddress | null
  shipped_date?: string | null
  payment_type?: string | null
  status: string
  total: string // Decimal as string
  service_fee?: string | null
  discount?: string | null
  archived?: boolean | null
  notes?: string | null
  items?: DopigoApiOrderItem[]
}

export interface DopigoOrderListResponse {
  count: number
  next: string | null
  previous: string | null
  results: DopigoApiOrder[]
}

// ===== Filtre / paginasyon =====

export interface ListOrdersParams {
  /** YYYY-MM-DD */
  serviceDateAfter?: string
  /** YYYY-MM-DD */
  serviceDateBefore?: string
  /** virgülle ayrılmış birden fazla kanal */
  salesChannel?: string
  /** waiting_shipment | shipped | cancelled | ... */
  status?: string
  /** max 100 — varsayılan 30 */
  limit?: number
  offset?: number
}

export async function listOrders(
  params: ListOrdersParams = {},
  credentials?: DopigoCredentials,
): Promise<DopigoOrderListResponse> {
  return dopigoGet<DopigoOrderListResponse>(
    "/api/v1/orders/",
    {
      service_date_after: params.serviceDateAfter,
      service_date_before: params.serviceDateBefore,
      sales_channel: params.salesChannel,
      status: params.status,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
    credentials,
  )
}

/**
 * Bir tarih aralığındaki tüm siparişleri sayfalayarak çeker.
 * Generator pattern — büyük sonuç setleri için bellek dostu.
 *
 * Rate limit defansı: her sayfa arasında 250ms bekler.
 */
export async function* iterateOrders(
  params: ListOrdersParams,
  credentials?: DopigoCredentials,
): AsyncGenerator<DopigoApiOrder, void, void> {
  const pageSize = params.limit ?? 100
  let offset = params.offset ?? 0
  let totalSeen = 0
  let totalCount: number | null = null

  while (true) {
    const page = await listOrders({ ...params, limit: pageSize, offset }, credentials)
    if (totalCount === null) totalCount = page.count

    for (const order of page.results) {
      yield order
      totalSeen++
    }

    if (page.results.length < pageSize) break
    if (totalCount !== null && totalSeen >= totalCount) break
    if (!page.next) break

    offset += pageSize
    await sleep(250)
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
