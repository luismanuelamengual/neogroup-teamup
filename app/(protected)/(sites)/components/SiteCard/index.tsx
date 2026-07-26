'use client'

import './index.scss'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PlaceIcon from '@mui/icons-material/Place'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import MuiSkeleton from '@mui/material/Skeleton'
import { MouseEvent, useState } from 'react'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'

interface SiteCardProps {
  site: SiteDto
  onEdit: (site: SiteDto) => void
  onDelete: (site: SiteDto) => void
}

export default function SiteCard({ site, onEdit, onDelete }: SiteCardProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const closeMenu = () => setMenuAnchor(null)

  const runAction = (action: (site: SiteDto) => void) => () => {
    closeMenu()
    action(site)
  }

  return (
    <Paper className="site-card">
      <div className="icon">
        <PlaceIcon />
      </div>
      <span className="name">{site.name}</span>
      <IconButton
        className="menu-button"
        aria-label={`Acciones de ${site.name}`}
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

export function SiteCardSkeleton() {
  return (
    <Paper className="site-card" sx={{ pointerEvents: 'none' }}>
      <MuiSkeleton variant="circular" width={40} height={40} sx={{ transform: 'none' }} />
      <MuiSkeleton variant="text" width={200} height={20} sx={{ transform: 'none' }} />
    </Paper>
  )
}
