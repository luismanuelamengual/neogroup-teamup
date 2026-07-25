'use client'

import './index.scss'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { FormEvent, useEffect, useState } from 'react'
import { useSites } from '@/app/(protected)/(sites)/hooks/useSites'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'
import { useNotifications } from '@/app/hooks/useNotifications'

interface SiteFormDialogProps {
  open: boolean
  /** Site being edited, or `null` to create a new one. */
  site: SiteDto | null
  onClose: () => void
  onSaved: () => void
}

export default function SiteFormDialog({ open, site, onClose, onSaved }: SiteFormDialogProps) {
  const { createSite, updateSite } = useSites()
  const { showSuccessMessage } = useNotifications()
  const isEdit = !!site
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset the form every time the dialog opens so it never shows the previous site's data.
  useEffect(() => {
    if (open) {
      setName(site?.name ?? '')
      setLoading(false)
    }
  }, [open, site])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)

    try {
      if (site) {
        await updateSite(site.id, { name })
        showSuccessMessage('Sede actualizada')
      } else {
        await createSite({ name })
        showSuccessMessage('Sede creada')
      }

      onSaved()
    } catch (requestError) {
      setLoading(false)

      return
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" className="site-form-dialog">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{isEdit ? 'Editar sede' : 'Nueva sede'}</DialogTitle>
        <DialogContent className="main-content">
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            fullWidth
            autoFocus
            helperText="El nombre con el que los organizadores van a elegir esta sede al crear un torneo"
          />
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
