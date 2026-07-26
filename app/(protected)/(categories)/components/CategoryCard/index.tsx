'use client'

import './index.scss'
import CategoryIcon from '@mui/icons-material/Category'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import MuiSkeleton from '@mui/material/Skeleton'
import { MouseEvent, useState } from 'react'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDisciplineNames } from '@/app/(protected)/(tournaments)/models/SubDiscipline'

interface CategoryCardProps {
  category: CategoryDto
  onEdit: (category: CategoryDto) => void
  onDelete: (category: CategoryDto) => void
}

export default function CategoryCard({ category, onEdit, onDelete }: CategoryCardProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const closeMenu = () => setMenuAnchor(null)

  const runAction = (action: (category: CategoryDto) => void) => () => {
    closeMenu()
    action(category)
  }

  return (
    <Paper className="category-card">
      <div className="icon">
        <CategoryIcon />
      </div>
      <div className="body">
        <span className="name">{category.name}</span>
        <div className="tags">
          <Chip size="small" variant="outlined" label={DisciplineNames[category.discipline]} />
          {category.subDiscipline != null && (
            <Chip size="small" variant="outlined" label={SubDisciplineNames[category.subDiscipline]} />
          )}
        </div>
      </div>
      <IconButton
        className="menu-button"
        aria-label={`Acciones de ${category.name}`}
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

export function CategoryCardSkeleton() {
  return (
    <Paper className="category-card" sx={{ pointerEvents: 'none' }}>
      <MuiSkeleton variant="circular" width={40} height={40} sx={{ transform: 'none' }} />
      <div className="body">
        <MuiSkeleton variant="text" width={160} height={20} sx={{ transform: 'none' }} />
        <MuiSkeleton variant="rounded" width={90} height={24} sx={{ transform: 'none' }} />
      </div>
    </Paper>
  )
}
