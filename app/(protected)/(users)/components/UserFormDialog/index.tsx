'use client'

import './index.scss'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { FormEvent, useEffect, useState } from 'react'
import SiteSelector from '@/app/(protected)/(sites)/components/SiteSelector'
import { useUsers } from '@/app/(protected)/(users)/hooks/useUsers'
import { useNotifications } from '@/app/hooks/useNotifications'
import { ManageableRoles, Role, RoleNames } from '@/app/models/Role'
import { UserDto } from '@/app/models/UserDto'

interface UserFormDialogProps {
  open: boolean
  /** User being edited, or `null` to create a new one. */
  user: UserDto | null
  onClose: () => void
  onSaved: () => void
}

export default function UserFormDialog({ open, user, onClose, onSaved }: UserFormDialogProps) {
  const { createUser, updateUser } = useUsers()
  const { showSuccessMessage } = useNotifications()
  const isEdit = !!user
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [siteId, setSiteId] = useState<number | null>(null)
  const [roleId, setRoleId] = useState<Role>(Role.PLAYER)
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(false)

  // Reset the form every time the dialog opens so it never shows the previous user's data.
  useEffect(() => {
    if (open) {
      setEmail(user?.email ?? '')
      setFirstName(user?.firstName ?? '')
      setLastName(user?.lastName ?? '')
      setPhoneNumber(user?.phoneNumber ?? '')
      setSiteId(user?.siteId ?? null)
      setRoleId(user?.roleId ?? Role.PLAYER)
      setActive(user?.active ?? true)
      setLoading(false)
    }
  }, [open, user])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)

    try {
      if (user) {
        await updateUser(user.id, { firstName, lastName, phoneNumber, siteId, roleId, active })
        showSuccessMessage('Usuario actualizado')
      } else {
        await createUser({ email, firstName, lastName, phoneNumber, siteId, roleId })
        showSuccessMessage('Usuario creado. Le enviamos un email para que defina su contraseña')
      }

      onSaved()
    } catch (requestError) {
      setLoading(false)

      return
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" className="user-form-dialog">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
        <DialogContent className="main-content">
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            fullWidth
            disabled={isEdit}
            helperText={
              isEdit ? 'El email no se puede modificar' : 'Le enviaremos un email para que defina su contraseña'
            }
          />
          <TextField
            label="Nombre"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Apellido"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Teléfono"
            type="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            fullWidth
          />
          <SiteSelector value={siteId} onChange={setSiteId} label="Sede" emptyLabel="Sin sede" />
          <TextField
            select
            label="Rol"
            value={roleId}
            onChange={(event) => setRoleId(Number(event.target.value) as Role)}
            fullWidth
          >
            {ManageableRoles.map((value) => (
              <MenuItem key={value} value={value}>
                {RoleNames[value]}
              </MenuItem>
            ))}
          </TextField>
          {isEdit && (
            <div className="active-field">
              <FormControlLabel
                control={<Switch checked={active} onChange={(event) => setActive(event.target.checked)} />}
                label="Usuario activo"
              />
              <Typography variant="caption" color="text.secondary">
                Un usuario inactivo no puede iniciar sesión, pero conserva todo su historial
              </Typography>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={loading} loading={loading}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
