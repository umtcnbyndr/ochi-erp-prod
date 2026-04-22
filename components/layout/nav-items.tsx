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
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: "Genel",
    items: [
      { label: "Panel", href: "/panel", icon: LayoutDashboard },
    ],
  },
  {
    title: "Ürünler",
    items: [
      { label: "Ürünler", href: "/urunler", icon: Package },
      { label: "Ürün Giriş", href: "/urun-giris", icon: PackagePlus },
      { label: "Ürün Çıkış", href: "/urun-cikis", icon: PackageMinus },
      { label: "Stok Hareketleri", href: "/stok-hareketleri", icon: ScrollText },
      { label: "Set Ürünler", href: "/set-urun", icon: Boxes },
    ],
  },
  {
    title: "Takas",
    items: [
      { label: "Takas", href: "/takas", icon: Repeat2 },
    ],
  },
  {
    title: "Eczane",
    items: [
      { label: "Eczane Veri Yükleme", href: "/eczane-yukleme", icon: Upload },
    ],
  },
  {
    title: "Tanımlar",
    items: [
      { label: "Markalar", href: "/markalar", icon: Tags },
      { label: "Kategoriler", href: "/kategoriler", icon: FolderTree },
      { label: "Pazar Yerleri", href: "/marketplaces", icon: Store },
      { label: "Cariler", href: "/cariler", icon: Users },
    ],
  },
  {
    title: "Sistem",
    items: [
      { label: "Raporlar", href: "/raporlar", icon: BarChart3 },
      { label: "Ayarlar", href: "/ayarlar", icon: Settings },
    ],
  },
]
