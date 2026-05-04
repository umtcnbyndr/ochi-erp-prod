"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Eye, Pencil, CheckSquare, Square } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { createUserAction, updateUserAction } from "./actions"

interface UserRow {
  id: string
  username: string
  name: string | null
  role: string
  isActive: boolean
  permissions: { module: string; canView: boolean; canEdit: boolean }[]
}

interface ModuleInfo {
  key: string
  label: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserRow | null // null = yeni oluştur
  modules: ModuleInfo[]
}

interface PermState {
  [moduleKey: string]: { canView: boolean; canEdit: boolean }
}

export function UserDialog({ open, onOpenChange, user, modules }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isEditing = user !== null

  // Form state
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "STAFF">("STAFF")
  const [perms, setPerms] = useState<PermState>({})

  // Dialog açıldığında formu doldur
  useEffect(() => {
    if (!open) return

    if (user) {
      setUsername(user.username)
      setName(user.name ?? "")
      setPassword("")
      setRole(user.role as "ADMIN" | "MANAGER" | "STAFF")

      const map: PermState = {}
      for (const mod of modules) {
        const existing = user.permissions.find((p) => p.module === mod.key)
        map[mod.key] = {
          canView: existing?.canView ?? false,
          canEdit: existing?.canEdit ?? false,
        }
      }
      setPerms(map)
    } else {
      setUsername("")
      setName("")
      setPassword("")
      setRole("STAFF")

      const map: PermState = {}
      for (const mod of modules) {
        map[mod.key] = { canView: false, canEdit: false }
      }
      setPerms(map)
    }
  }, [open, user, modules])

  function toggleView(key: string) {
    setPerms((prev) => {
      const current = prev[key] ?? { canView: false, canEdit: false }
      const newView = !current.canView
      return {
        ...prev,
        [key]: {
          canView: newView,
          // canView false olursa canEdit de false olmalı
          canEdit: newView ? current.canEdit : false,
        },
      }
    })
  }

  function toggleEdit(key: string) {
    setPerms((prev) => {
      const current = prev[key] ?? { canView: false, canEdit: false }
      const newEdit = !current.canEdit
      return {
        ...prev,
        [key]: {
          // canEdit true olursa canView da true olmalı
          canView: newEdit ? true : current.canView,
          canEdit: newEdit,
        },
      }
    })
  }

  function selectAll(type: "view" | "edit") {
    setPerms((prev) => {
      const allOn = modules.every((m) => prev[m.key]?.[type === "view" ? "canView" : "canEdit"])
      const newState = { ...prev }
      for (const mod of modules) {
        if (type === "view") {
          newState[mod.key] = {
            ...newState[mod.key],
            canView: !allOn,
            canEdit: !allOn ? newState[mod.key]?.canEdit ?? false : false,
          }
        } else {
          newState[mod.key] = {
            ...newState[mod.key],
            canView: !allOn ? true : newState[mod.key]?.canView ?? false,
            canEdit: !allOn,
          }
        }
      }
      return newState
    })
  }

  function handleSubmit() {
    startTransition(async () => {
      if (isEditing) {
        const result = await updateUserAction(user.id, {
          name: name || undefined,
          password: password || undefined,
          role,
          permissions: perms,
        })
        if (result.success) {
          toast.success("Kullanıcı güncellendi")
          onOpenChange(false)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createUserAction({
          username,
          name,
          password,
          role,
          permissions: perms,
        })
        if (result.success) {
          toast.success(`"${result.data?.username}" oluşturuldu`)
          onOpenChange(false)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const isAdmin = role === "ADMIN"
  const allViewChecked = modules.every((m) => perms[m.key]?.canView)
  const allEditChecked = modules.every((m) => perms[m.key]?.canEdit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Kullanıcı Düzenle" : "Yeni Kullanıcı"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Kullanıcı bilgilerini ve modül izinlerini düzenleyin"
              : "Kullanıcı adı, şifre ve modül izinlerini belirleyin"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Temel bilgiler */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Kullanıcı Adı</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                disabled={isEditing || pending}
                placeholder="enbiye"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">İsim</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                placeholder="Enbiye Yılmaz"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password">
                {isEditing ? "Yeni Şifre (boş bırakırsan değişmez)" : "Şifre"}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
                placeholder={isEditing ? "••••" : ""}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin (Tam erişim)</SelectItem>
                  <SelectItem value="MANAGER">Yönetici</SelectItem>
                  <SelectItem value="STAFF">Personel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* İzin Matrisi */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Modül İzinleri</Label>
              {isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Admin — tüm modüllere tam erişim
                </p>
              )}
            </div>

            {isAdmin ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Admin kullanıcılar otomatik olarak tüm modüllere tam erişime sahiptir.
                İzin matrisi devre dışıdır.
              </div>
            ) : (
              <div className="rounded-md border">
                {/* Header */}
                <div className="flex items-center border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <div className="flex-1">Modül</div>
                  <div className="w-20 text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => selectAll("view")}
                    >
                      <Eye className="h-3 w-3" />
                      Görme
                      {allViewChecked ? (
                        <CheckSquare className="h-3 w-3 text-primary" />
                      ) : (
                        <Square className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  <div className="w-20 text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => selectAll("edit")}
                    >
                      <Pencil className="h-3 w-3" />
                      Düzenle
                      {allEditChecked ? (
                        <CheckSquare className="h-3 w-3 text-primary" />
                      ) : (
                        <Square className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Module rows */}
                <div className="divide-y">
                  {modules.map((mod) => {
                    const perm = perms[mod.key] ?? { canView: false, canEdit: false }
                    return (
                      <div
                        key={mod.key}
                        className="flex items-center px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1">{mod.label}</div>
                        <div className="w-20 flex justify-center">
                          <Checkbox
                            checked={perm.canView}
                            onCheckedChange={() => toggleView(mod.key)}
                            disabled={pending}
                          />
                        </div>
                        <div className="w-20 flex justify-center">
                          <Checkbox
                            checked={perm.canEdit}
                            onCheckedChange={() => toggleEdit(mod.key)}
                            disabled={pending}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : isEditing ? (
              "Güncelle"
            ) : (
              "Oluştur"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
