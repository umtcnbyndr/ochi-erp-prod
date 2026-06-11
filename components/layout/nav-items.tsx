import {
  LayoutDashboard,
  Package,
  PackagePlus,
  PackageMinus,
  Repeat2,
  ScrollText,
  Boxes,
  Upload,
  Tags,
  FolderTree,
  Store,
  Users,
  BarChart3,
  Settings,
  Download,
  TrendingUp,
  Link2,
  Sparkles,
  ShoppingCart,
  Megaphone,
  Heart,
  ShoppingBasket,
  Ticket,
  Percent,
  Receipt,
  Archive,
  AlertTriangle,
  Edit3,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  /** İzin sistemi için modül key'i */
  moduleKey: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

// Sıralama mantığı (2026-06-11): önem + günlük kullanım sıklığı.
// Üstte: panel → günlük satış/fiyat (pazaryeri) → her sabah eczane.
// Ortada: ürün/stok operasyonu. Altta: aylık finans, raporlar, nadir tanım/sistem.
export const navGroups: NavGroup[] = [
  {
    title: "Genel",
    items: [
      { label: "Panel", href: "/panel", icon: LayoutDashboard, moduleKey: "panel" },
    ],
  },
  {
    // Ürün & stok — günlük çekirdek (en üstte, user kararı 2026-06-11)
    title: "Ürünler",
    items: [
      { label: "Ürünler", href: "/urunler", icon: Package, moduleKey: "urunler" },
      { label: "Ürün Giriş", href: "/urun-giris", icon: PackagePlus, moduleKey: "urun-giris" },
      { label: "Ürün Çıkış", href: "/urun-cikis", icon: PackageMinus, moduleKey: "urun-cikis" },
      { label: "Takas", href: "/takas", icon: Repeat2, moduleKey: "takas" },
      { label: "Stok Hareketleri", href: "/stok-hareketleri", icon: ScrollText, moduleKey: "stok-hareketleri" },
      { label: "Set Ürünler", href: "/set-urun", icon: Boxes, moduleKey: "set-urun" },
      { label: "Siparişler", href: "/siparisler", icon: ShoppingCart, moduleKey: "siparisler" },
      { label: "Kampanyalar", href: "/kampanyalar", icon: Megaphone, moduleKey: "kampanyalar" },
    ],
  },
  {
    // Günlük satış/fiyat motoru
    title: "Pazaryeri",
    items: [
      { label: "Dopigo Siparişler", href: "/dopigo-siparisler", icon: ShoppingBasket, moduleKey: "dopigo-siparisler" },
      { label: "Stok Uyarıları", href: "/stok-uyarilari", icon: AlertTriangle, moduleKey: "stok-uyarilari" },
      { label: "Dopigo Aktarım", href: "/dopigo-aktar", icon: Download, moduleKey: "dopigo-aktar" },
      { label: "Dopigo Yükleme", href: "/dopigo-yukle", icon: Upload, moduleKey: "dopigo-yukle" },
      { label: "Fiyat Önerileri", href: "/fiyat-onerileri", icon: Sparkles, moduleKey: "fiyat-onerileri" },
      { label: "Fiyat Kontrol", href: "/fiyat-kontrol", icon: TrendingUp, moduleKey: "fiyat-kontrol" },
      { label: "Komisyon Tarifeleri", href: "/komisyon-tarifeleri", icon: Percent, moduleKey: "komisyon-tarifeleri" },
      { label: "Kupon Önerileri", href: "/kupon-onerileri", icon: Ticket, moduleKey: "kupon-onerileri" },
      { label: "Trendyol Favorilenme", href: "/trendyol-favoriler", icon: Heart, moduleKey: "trendyol-favoriler" },
      { label: "Barkod Eşleştirme", href: "/barkod-eslestirme", icon: Link2, moduleKey: "barkod-eslestirme" },
    ],
  },
  {
    // Her sabah ilk iş
    title: "Eczane",
    items: [
      { label: "Eczane Veri Yükleme", href: "/eczane-yukleme", icon: Upload, moduleKey: "eczane-yukleme" },
    ],
  },
  {
    // Aylık — en sık açılan üstte
    title: "Finans",
    items: [
      { label: "Mutabakat", href: "/finans/mutabakat", icon: Receipt, moduleKey: "finans-mutabakat" },
      { label: "Gelir / Gider", href: "/finans/gelir-gider", icon: BarChart3, moduleKey: "finans-gelir-gider" },
      { label: "Alış Faturaları", href: "/finans/faturalar", icon: Receipt, moduleKey: "finans-faturalar" },
      { label: "Eksik Alış", href: "/finans/eksik-alis", icon: AlertTriangle, moduleKey: "finans-eksik-alis" },
    ],
  },
  {
    title: "Raporlar",
    items: [
      { label: "Raporlar", href: "/raporlar", icon: BarChart3, moduleKey: "raporlar" },
    ],
  },
  {
    // Nadiren değişir — kurulum/referans
    title: "Tanımlar",
    items: [
      { label: "Markalar", href: "/markalar", icon: Tags, moduleKey: "markalar" },
      { label: "Kategoriler", href: "/kategoriler", icon: FolderTree, moduleKey: "kategoriler" },
      { label: "Pazar Yerleri", href: "/marketplaces", icon: Store, moduleKey: "marketplaces" },
      { label: "Cariler", href: "/cariler", icon: Users, moduleKey: "cariler" },
    ],
  },
  {
    title: "Sistem",
    items: [
      { label: "Ayarlar", href: "/ayarlar", icon: Settings, moduleKey: "ayarlar" },
      { label: "Yedekleme", href: "/ayarlar/yedekleme", icon: Archive, moduleKey: "ayarlar" },
      { label: "Toplu İsim Düzelt", href: "/ayarlar/isim-duzeltme", icon: Edit3, moduleKey: "ayarlar" },
    ],
  },
]
