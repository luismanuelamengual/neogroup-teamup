'use client'

import './index.scss'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import LockResetIcon from '@mui/icons-material/LockReset'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import MuiSkeleton from '@mui/material/Skeleton'
import { MouseEvent, useState } from 'react'
import Avatar from '@/app/components/Avatar'
import { RoleNames } from '@/app/models/Role'
import { UserDto } from '@/app/models/UserDto'

interface UserCardProps {
  user: UserDto
  onEdit: (user: UserDto) => void
  onResetPassword: (user: UserDto) => void
  onDelete: (user: UserDto) => void
}

export default function UserCard({ user, onEdit, onResetPassword, onDelete }: UserCardProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const closeMenu = () => setMenuAnchor(null)

  const runAction = (action: (user: UserDto) => void) => () => {
    closeMenu()
    action(user)
  }

  return (
    <Paper className="user-card">
      <Avatar email={user.email} name={user.displayName} size="md" className="avatar" />
      <div className="body">
        <div className="identity">
          <span className="name">{user.displayName}</span>
          <span className="email">{user.email}</span>
        </div>
        <div className="tags">
          {user.roleId != null ? (
            <Chip size="small" variant="outlined" label={RoleNames[user.roleId]} className="role" />
          ) : (
            <Chip size="small" variant="outlined" color="warning" label="Sin rol" className="role" />
          )}
          {!user.active && <Chip size="small" color="error" label="Inactivo" />}
          {!user.emailVerified && <Chip size="small" color="warning" label="Email sin verificar" />}
        </div>
      </div>
      <IconButton
        className="menu-button"
        aria-label={`Acciones de ${user.displayName}`}
        onClick={(event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        <MenuItem onClick={runAction(onEdit)}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          Editar
        </MenuItem>
        <MenuItem onClick={runAction(onResetPassword)}>
          <ListItemIcon>
            <LockResetIcon fontSize="small" />
          </ListItemIcon>
          Resetear contraseña
        </MenuItem>
        <MenuItem onClick={runAction(onDelete)} className="delete-action">
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          Eliminar
        </MenuItem>
      </Menu>
    </Paper>
  )
}

export function UserCardSkeleton() {
  return (
    <Paper className="user-card" sx={{ pointerEvents: 'none' }}>
      <MuiSkeleton variant="circular" width={40} height={40} sx={{ transform: 'none' }} />
      <div className="body">
        <div className="identity">
          <MuiSkeleton variant="text" width={180} height={20} sx={{ transform: 'none' }} />
          <MuiSkeleton variant="text" width={220} height={16} sx={{ transform: 'none' }} />
        </div>
        <MuiSkeleton variant="rounded" width={90} height={24} sx={{ transform: 'none' }} />
      </div>
    </Paper>
  )
}
