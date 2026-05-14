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

export const navGroups: NavGroup[] = [
  {
    title: "Genel",
    items: [
      { label: "Panel", href: "/panel", icon: LayoutDashboard, moduleKey: "panel" },
    ],
  },
  {
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
    title: "Eczane",
    items: [
      { label: "Eczane Veri Yükleme", href: "/eczane-yukleme", icon: Upload, moduleKey: "eczane-yukleme" },
    ],
  },
  {
    title: "Pazaryeri",
    items: [
      { label: "Barkod Eşleştirme", href: "/barkod-eslestirme", icon: Link2, moduleKey: "barkod-eslestirme" },
      { label: "Dopigo Yükleme", href: "/dopigo-yukle", icon: Upload, moduleKey: "dopigo-yukle" },
      { label: "Dopigo Aktarım", href: "/dopigo-aktar", icon: Download, moduleKey: "dopigo-aktar" },
      { label: "Fiyat Önerileri", href: "/fiyat-onerileri", icon: Sparkles, moduleKey: "fiyat-onerileri" },
      { label: "Fiyat Kontrol", href: "/fiyat-kontrol", icon: TrendingUp, moduleKey: "fiyat-kontrol" },
      { label: "Trendyol Favorilenme", href: "/trendyol-favoriler", icon: Heart, moduleKey: "trendyol-favoriler" },
      { label: "Komisyon Tarifeleri", href: "/komisyon-tarifeleri", icon: Percent, moduleKey: "komisyon-tarifeleri" },
      { label: "Kupon Önerileri", href: "/kupon-onerileri", icon: Ticket, moduleKey: "kupon-onerileri" },
      { label: "Dopigo Siparişler", href: "/dopigo-siparisler", icon: ShoppingBasket, moduleKey: "dopigo-siparisler" },
    ],
  },
  {
    title: "Finans",
    items: [
      { label: "Alış Faturaları", href: "/finans/faturalar", icon: Receipt, moduleKey: "finans-faturalar" },
      { label: "Gelir / Gider", href: "/finans/gelir-gider", icon: BarChart3, moduleKey: "finans-gelir-gider" },
    ],
  },
  {
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
      { label: "Raporlar", href: "/raporlar", icon: BarChart3, moduleKey: "raporlar" },
      { label: "Ayarlar", href: "/ayarlar", icon: Settings, moduleKey: "ayarlar" },
    ],
  },
]
