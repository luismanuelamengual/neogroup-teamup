'use client'

import 'dayjs/locale/es'
import './index.scss'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

interface EditTournamentDialogProps {
  open: boolean
  tournament: TournamentDto
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

export default function EditTournamentDialog({
  open,
  tournament,
  onClose,
  onSaved,
  onDeleted
}: EditTournamentDialogProps) {
  const { deleteTournament, updateTournament } = useTournaments()
  const [name, setName] = useState(tournament.name)
  const [description, setDescription] = useState(tournament.description ?? '')
  const [location, setLocation] = useState(tournament.location ?? '')
  const [startDate, setStartDate] = useState<Dayjs | null>(tournament.startDate ? dayjs(tournament.startDate) : null)
  const [startTime, setStartTime] = useState<Dayjs | null>(
    tournament.startTime ? dayjs(`2000-01-01T${tournament.startTime}`) : null
  )
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setName(tournament.name)
      setDescription(tournament.description ?? '')
      setLocation(tournament.location ?? '')
      setStartDate(tournament.startDate ? dayjs(tournament.startDate) : null)
      setStartTime(tournament.startTime ? dayjs(`2000-01-01T${tournament.startTime}`) : null)
    }
  }, [open, tournament])

  const handleSave = async () => {
    setLoading(true)

    try {
      await updateTournament(tournament.id, {
        name,
        description,
        location,
        startDate: startDate ? startDate.format('YYYY-MM-DD') : '',
        startTime: startTime ? startTime.format('HH:mm') : null
      })
      onSaved()
    } catch (requestError) {}

    setLoading(false)
  }

  const handleDelete = async () => {
    setConfirmDeleteOpen(false)
    setDeleting(true)

    try {
      await deleteTournament(tournament.id)
      onDeleted?.()
    } catch (requestError) {}

    setDeleting(false)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" className="edit-tournament-dialog">
      <DialogTitle>Editar torneo</DialogTitle>
      <DialogContent className="main-content">
        <TextField label="Nombre" value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
        <TextField
          label="Descripción"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField label="Lugar" value={location} onChange={(event) => setLocation(event.target.value)} fullWidth />
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
          <DatePicker
            label="Fecha de inicio"
            value={startDate}
            onChange={(value) => setStartDate(value)}
            format="YYYY/MM/DD"
            slotProps={{ textField: { fullWidth: true } }}
          />
          <TimePicker
            label="Hora de inicio"
            value={startTime}
            onChange={(value) => setStartTime(value)}
            slotProps={{ textField: { fullWidth: true } }}
            ampm={false}
          />
        </LocalizationProvider>
      </DialogContent>
      <DialogActions className="actions">
        <Button
          variant="outlined"
          color="error"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={deleting}
          loading={deleting}
        >
          Eliminar
        </Button>
        <div style={{ flex: 1 }} />
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={loading} loading={loading}>
          Guardar
        </Button>
      </DialogActions>

      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle>Eliminar torneo</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Estás seguro que querés eliminar el torneo &ldquo;{tournament.name}&rdquo;? Esta acción no se puede
            deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
