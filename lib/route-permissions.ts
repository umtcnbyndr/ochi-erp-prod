/**
 * Edge-safe route → modül haritası (Prisma/Node bağımlılığı YOK).
 *
 * Hem middleware (Edge runtime) hem server tarafı `lib/permissions.ts` bunu kullanır.
 * TEK doğru kaynak — yeni sayfa eklenince buraya modül tanımı eklenir, middleware
 * otomatik olarak o route'u korur (fail-closed: tanımsız route serbest, tanımlı
 * route izin ister).
 */

export interface ModuleDefinition {
  key: string
  label: string
  /** Sidebar + permission kontrolünde kullanılan route(lar). */
  routes: string[]
}

export const ALL_MODULES: ModuleDefinition[] = [
  { key: "panel",            label: "Panel",              routes: ["/panel"] },
  { key: "urunler",          label: "Ürünler",            routes: ["/urunler"] },
  { key: "urun-giris",       label: "Ürün Giriş",        routes: ["/urun-giris"] },
  { key: "urun-cikis",       label: "Ürün Çıkış",        routes: ["/urun-cikis"] },
  { key: "takas",            label: "Takas",              routes: ["/takas"] },
  { key: "stok-hareketleri", label: "Stok Hareketleri",   routes: ["/stok-hareketleri"] },
  { key: "set-urun",         label: "Set Ürünler",        routes: ["/set-urun"] },
  { key: "siparisler",       label: "Siparişler",         routes: ["/siparisler"] },
  { key: "kampanyalar",      label: "Kampanyalar",        routes: ["/kampanyalar"] },
  { key: "eczane-yukleme",   label: "Eczane Veri Yükleme",routes: ["/eczane-yukleme"] },
  { key: "barkod-eslestirme",label: "Barkod Eşleştirme",  routes: ["/barkod-eslestirme"] },
  { key: "dopigo-yukle",     label: "Dopigo Yükleme",     routes: ["/dopigo-yukle"] },
  { key: "dopigo-aktar",     label: "Dopigo Aktarım",     routes: ["/dopigo-aktar"] },
  { key: "fiyat-onerileri",  label: "Fiyat Önerileri",    routes: ["/fiyat-onerileri"] },
  { key: "fiyat-kontrol",    label: "Fiyat Kontrol",      routes: ["/fiyat-kontrol"] },
  { key: "trendyol-favoriler", label: "Trendyol Favorilenme", routes: ["/trendyol-favoriler"] },
  { key: "komisyon-tarifeleri", label: "Komisyon Tarifeleri", routes: ["/komisyon-tarifeleri"] },
  { key: "kupon-onerileri",  label: "Kupon Önerileri",   routes: ["/kupon-onerileri"] },
  { key: "dopigo-siparisler",label: "Dopigo Siparişler",  routes: ["/dopigo-siparisler"] },
  { key: "stok-uyarilari",   label: "Stok Uyarıları",     routes: ["/stok-uyarilari"] },
  { key: "markalar",         label: "Markalar",           routes: ["/markalar"] },
  { key: "kategoriler",      label: "Kategoriler",        routes: ["/kategoriler"] },
  { key: "marketplaces",     label: "Pazar Yerleri",      routes: ["/marketplaces"] },
  { key: "cariler",          label: "Cariler",            routes: ["/cariler"] },
  { key: "finans-faturalar", label: "Alış Faturaları",    routes: ["/finans/faturalar"] },
  { key: "finans-gelir-gider", label: "Gelir / Gider",    routes: ["/finans/gelir-gider"] },
  { key: "finans-eksik-alis",  label: "Eksik Alış",         routes: ["/finans/eksik-alis"] },
  { key: "finans-mutabakat",   label: "Mutabakat",          routes: ["/finans/mutabakat"] },
  { key: "raporlar",         label: "Raporlar",           routes: ["/raporlar"] },
  { key: "ayarlar",          label: "Ayarlar",            routes: ["/ayarlar"] },
]

export const MODULE_KEYS = ALL_MODULES.map((m) => m.key)

/**
 * pathname'den module key'i bul. Eşleşmezse null (o route izin gerektirmez:
 * örn. "/", "/yetkisiz"). Prefix eşleşmesi: "/siparisler/123" → "siparisler".
 */
export function getModuleKeyForRoute(pathname: string): string | null {
  for (const mod of ALL_MODULES) {
    for (const route of mod.routes) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        return mod.key
      }
    }
  }
  return null
}
