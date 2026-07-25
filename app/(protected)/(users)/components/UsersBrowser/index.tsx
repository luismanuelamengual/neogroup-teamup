'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import { useCallback, useEffect, useState } from 'react'
import UserCard, { UserCardSkeleton } from '@/app/(protected)/(users)/components/UserCard'
import UserFormDialog from '@/app/(protected)/(users)/components/UserFormDialog'
import { useUsers } from '@/app/(protected)/(users)/hooks/useUsers'
import MessagePanel from '@/app/components/MessagePanel'
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue'
import { useLoadingData } from '@/app/hooks/useLoadingData'
import { useNotifications } from '@/app/hooks/useNotifications'
import { ManageableRoles, Role, RoleNames } from '@/app/models/Role'
import { UserDto } from '@/app/models/UserDto'

const PAGE_SIZE = 10

type RoleFilter = Role | 'all'

/** Users ABM of the organization: search, create, edit, delete and password reset. */
export default function UsersBrowser() {
  const { getUsers, deleteUser, resetUserPassword } = useUsers()
  const { showSuccessMessage } = useNotifications()
  const [queryInput, setQueryInput] = useState('')
  const debouncedQuery = useDebouncedValue(queryInput)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [users, setUsers] = useState<UserDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [reloadToken, setReloadToken] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editedUser, setEditedUser] = useState<UserDto | null>(null)
  const [userToDelete, setUserToDelete] = useState<UserDto | null>(null)
  const [userToReset, setUserToReset] = useState<UserDto | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  // A new search or role filter always starts back on the first page.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, roleFilter])

  const { loading } = useLoadingData(async () => {
    const { data, lastPage } = await getUsers({
      query: debouncedQuery.trim(),
      roleId: roleFilter === 'all' ? null : roleFilter,
      page,
      pageSize: PAGE_SIZE
    })

    setUsers(data)
    setPageCount(lastPage)
  }, [debouncedQuery, roleFilter, page, reloadToken])

  const openCreateForm = () => {
    setEditedUser(null)
    setFormOpen(true)
  }

  const openEditForm = (user: UserDto) => {
    setEditedUser(user)
    setFormOpen(true)
  }

  const handleSaved = () => {
    setFormOpen(false)
    reload()
  }

  const handleDelete = async () => {
    if (!userToDelete) {
      return
    }

    setActionLoading(true)

    try {
      await deleteUser(userToDelete.id)
      showSuccessMessage('Usuario eliminado')
      setUserToDelete(null)
      reload()
    } catch (requestError) {}

    setActionLoading(false)
  }

  const handleResetPassword = async () => {
    if (!userToReset) {
      return
    }

    setActionLoading(true)

    try {
      await resetUserPassword(userToReset.id)
      showSuccessMessage(`Le enviamos un email a ${userToReset.email} para que defina una nueva contraseña`)
      setUserToReset(null)
    } catch (requestError) {}

    setActionLoading(false)
  }

  return (
    <div className="users-browser">
      <div className="header">
        <div className="filters">
          <TextField
            size="small"
            placeholder="Buscar por nombre o email"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            className="query-filter"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }
            }}
          />
          <TextField
            select
            size="small"
            label="Rol"
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value === 'all' ? 'all' : (Number(event.target.value) as Role))
            }
            className="role-filter"
          >
            <MenuItem value="all">Todos</MenuItem>
            {ManageableRoles.map((value) => (
              <MenuItem key={value} value={value}>
                {RoleNames[value]}
              </MenuItem>
            ))}
          </TextField>
        </div>
        <div className="actions">
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateForm} className="create-button">
            Nuevo usuario
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="list">
          {Array.from({ length: 5 }).map((_, index) => (
            <UserCardSkeleton key={index} />
          ))}
        </div>
      ) : users.length === 0 ? (
        <MessagePanel>No se encontraron usuarios</MessagePanel>
      ) : (
        <>
          <div className="list">
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onEdit={openEditForm}
                onResetPassword={setUserToReset}
                onDelete={setUserToDelete}
              />
            ))}
          </div>
          {pageCount > 1 && (
            <Pagination
              className="paginator"
              count={pageCount}
              page={page}
              onChange={(_, value) => setPage(value)}
              color="primary"
            />
          )}
        </>
      )}

      <UserFormDialog open={formOpen} user={editedUser} onClose={() => setFormOpen(false)} onSaved={handleSaved} />

      <Dialog open={!!userToDelete} onClose={() => setUserToDelete(null)}>
        <DialogTitle>Eliminar usuario</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Estás seguro que querés eliminar a {userToDelete?.displayName} ({userToDelete?.email})? Esta acción no se
            puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserToDelete(null)} disabled={actionLoading}>
            Cancelar
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={actionLoading}
            loading={actionLoading}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!userToReset} onClose={() => setUserToReset(null)}>
        <DialogTitle>Resetear contraseña</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Le enviaremos un email a {userToReset?.email} con un enlace para que defina una nueva contraseña. El enlace
            anterior, si existía, deja de ser válido.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserToReset(null)} disabled={actionLoading}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleResetPassword} disabled={actionLoading} loading={actionLoading}>
            Enviar email
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
