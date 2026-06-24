'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
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
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { deleteTournament, updateTournament } from '@/app/(protected)/(tournaments)/actions/tournament'
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
  const t = useTranslations('tournaments')
  const router = useRouter()
  const tOrganizer = useTranslations('organizer')
  const tCommon = useTranslations('common')
  const [name, setName] = useState(tournament.name)
  const [description, setDescription] = useState(tournament.description ?? '')
  const [location, setLocation] = useState(tournament.location ?? '')
  const [startDate, setStartDate] = useState<Dayjs | null>(tournament.startDate ? dayjs(tournament.startDate) : null)
  const [startTime, setStartTime] = useState<Dayjs | null>(
    tournament.startTime ? dayjs(`2000-01-01T${tournament.startTime}`) : null
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setName(tournament.name)
      setDescription(tournament.description ?? '')
      setLocation(tournament.location ?? '')
      setStartDate(tournament.startDate ? dayjs(tournament.startDate) : null)
      setStartTime(tournament.startTime ? dayjs(`2000-01-01T${tournament.startTime}`) : null)
      setError(null)
    }
  }, [open, tournament])

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    try {
      await updateTournament(tournament.id, {
        name,
        description,
        location,
        startDate: startDate ? startDate.format('YYYY-MM-DD') : '',
        startTime: startTime ? startTime.format('HH:mm') : null
      })
    } catch (requestError) {
      setLoading(false)
      setError(tOrganizer(`errors.${(requestError as Error).message}`))

      return
    }

    setLoading(false)
    onSaved()
  }

  const handleDelete = async () => {
    setConfirmDeleteOpen(false)
    setLoading(true)
    setError(null)

    try {
      await deleteTournament(tournament.id)
    } catch (requestError) {
      setLoading(false)
      setError(tOrganizer(`errors.${(requestError as Error).message}`))

      return
    }

    setLoading(false)
    onDeleted?.()
    router.push('/tournaments')
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" className="edit-tournament-dialog">
      <DialogTitle>{tOrganizer('manage.editTitle')}</DialogTitle>
      <DialogContent className="main-content">
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t('name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label={t('description')}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField
          label={t('location')}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          fullWidth
        />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DatePicker
            label={t('startDate')}
            value={startDate}
            onChange={(value) => setStartDate(value)}
            format="YYYY/MM/DD"
            slotProps={{ textField: { fullWidth: true } }}
          />
          <TimePicker
            label={t('startTime')}
            value={startTime}
            onChange={(value) => setStartTime(value)}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </LocalizationProvider>
      </DialogContent>
      <DialogActions className="actions">
        <Button variant="outlined" color="error" onClick={() => setConfirmDeleteOpen(true)} disabled={loading}>
          {tCommon('delete')}
        </Button>
        <div style={{ flex: 1 }} />
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={loading}>
          {tCommon('save')}
        </Button>
      </DialogActions>

      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle>{tOrganizer('manage.deleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{tOrganizer('manage.deleteConfirm', { name: tournament.name })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)}>{tCommon('cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            {tCommon('delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
