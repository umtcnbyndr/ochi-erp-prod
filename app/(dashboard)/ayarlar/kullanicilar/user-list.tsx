"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/common/confirm-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/common/empty-state"
import { UserDialog } from "./user-dialog"
import { deleteUserAction, updateUserAction } from "./actions"

interface UserRow {
  id: string
  username: string
  name: string | null
  email: string
  role: string
  isActive: boolean
  createdAt: string
  permissions: { module: string; canView: boolean; canEdit: boolean }[]
}

interface ModuleInfo {
  key: string
  label: string
}

interface Props {
  users: UserRow[]
  modules: ModuleInfo[]
}

const ROLE_LABELS: Record<string, { label: string; icon: typeof Shield; variant: "default" | "secondary" | "outline" }> = {
  ADMIN:   { label: "Admin",   icon: ShieldAlert,  variant: "default" },
  MANAGER: { label: "Yönetici",icon: ShieldCheck,  variant: "secondary" },
  STAFF:   { label: "Personel",icon: Shield,       variant: "outline" },
}

export function UserList({ users, modules }: Props) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)

  function handleCreate() {
    setEditingUser(null)
    setDialogOpen(true)
  }

  function handleEdit(user: UserRow) {
    setEditingUser(user)
    setDialogOpen(true)
  }

  async function handleToggleActive(user: UserRow) {
    const action = user.isActive ? "deaktif" : "aktif"
    const ok = await confirmDialog({
      title: `"${user.name ?? user.username}" ${action} yapılacak`,
      description: "Devam etmek istiyor musun?",
      confirmText: "Onayla",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await updateUserAction(user.id, { isActive: !user.isActive })
      if (result.success) {
        toast.success(`Kullanıcı ${action} yapıldı`)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  async function handleDelete(user: UserRow) {
    const ok = await confirmDialog({
      title: `"${user.name ?? user.username}" silinecek`,
      description: "Bu işlem geri alınamaz.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteUserAction(user.id)
      if (result.success) {
        toast.success("Kullanıcı silindi")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Kullanıcının erişebildiği modül sayısını hesapla
  function getAccessCount(user: UserRow): number {
    if (user.role === "ADMIN") return modules.length
    return user.permissions.filter((p) => p.canView).length
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Kullanıcılar</CardTitle>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Yeni Kullanıcı
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Users}
                title="Henüz kullanıcı yok"
                description="Yeni kullanıcı ekleyerek başlayın."
                action={
                  <Button size="sm" onClick={handleCreate}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Yeni Kullanıcı
                  </Button>
                }
              />
            </div>
          ) : (
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead>Kullanıcı Adı</TableHead>
                <TableHead>İsim</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-center">Erişim</TableHead>
                <TableHead className="text-center">Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const role = ROLE_LABELS[user.role] ?? ROLE_LABELS.STAFF
                const RoleIcon = role.icon
                return (
                  <TableRow
                    key={user.id}
                    className={!user.isActive ? "opacity-50" : ""}
                  >
                    <TableCell className="font-mono text-[12px]">
                      {user.username}
                    </TableCell>
                    <TableCell className="font-medium">
                      {user.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.variant} className="gap-1 text-[10px]">
                        <RoleIcon className="h-3 w-3" />
                        {role.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-[12px]">
                      {user.role === "ADMIN" ? (
                        <span className="text-muted-foreground">Tam erişim</span>
                      ) : (
                        <span>
                          {getAccessCount(user)}/{modules.length} modül
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {user.isActive ? (
                        <Badge variant="default" className="text-[10px]">Aktif</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Pasif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={pending}
                          onClick={() => handleEdit(user)}
                          title="Düzenle"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={pending}
                          onClick={() => handleToggleActive(user)}
                          title={user.isActive ? "Deaktif et" : "Aktif et"}
                        >
                          {user.isActive ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        {user.role !== "ADMIN" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            disabled={pending}
                            onClick={() => handleDelete(user)}
                            title="Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editingUser}
        modules={modules}
      />
    </>
  )
}
