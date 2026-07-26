'use client'

import './index.scss'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { FormEvent, useEffect, useState } from 'react'
import { useManagedCategories } from '@/app/(protected)/(categories)/hooks/useManagedCategories'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline, DisciplineNames, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import { useNotifications } from '@/app/hooks/useNotifications'

interface CategoryFormDialogProps {
  open: boolean
  /** Category being edited, or `null` to create a new one. */
  category: CategoryDto | null
  onClose: () => void
  onSaved: () => void
}

export default function CategoryFormDialog({ open, category, onClose, onSaved }: CategoryFormDialogProps) {
  const { createCategory, updateCategory } = useManagedCategories()
  const { showSuccessMessage } = useNotifications()
  const isEdit = !!category
  const [name, setName] = useState('')
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.PADEL)
  const [loading, setLoading] = useState(false)

  // Reset the form every time the dialog opens so it never shows the previous category's data.
  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setDiscipline(category?.discipline ?? Discipline.PADEL)
      setLoading(false)
    }
  }, [open, category])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)

    const input = { name, discipline }

    try {
      if (category) {
        await updateCategory(category.id, input)
        showSuccessMessage('Categoría actualizada')
      } else {
        await createCategory(input)
        showSuccessMessage('Categoría creada')
      }

      onSaved()
    } catch (requestError) {
      setLoading(false)

      return
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" className="category-form-dialog">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{isEdit ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
        <DialogContent className="main-content">
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            fullWidth
            autoFocus
          />
          <TextField
            select
            label="Disciplina"
            value={discipline}
            onChange={(event) => setDiscipline(Number(event.target.value) as Discipline)}
            fullWidth
          >
            {Disciplines.map((value) => (
              <MenuItem key={value} value={value}>
                {DisciplineNames[value]}
              </MenuItem>
            ))}
          </TextField>
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
