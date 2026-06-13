'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { updateTournament } from '@/app/(tournaments)/actions/tournament'
import { Tournament } from '@/app/(tournaments)/models/Tournament'

interface EditTournamentDialogProps {
  open: boolean
  tournament: Tournament
  onClose: () => void
  onSaved: () => void
}

export default function EditTournamentDialog({ open, tournament, onClose, onSaved }: EditTournamentDialogProps) {
  const t = useTranslations('tournaments')
  const tOrganizer = useTranslations('organizer')
  const tCommon = useTranslations('common')
  const [name, setName] = useState(tournament.name)
  const [description, setDescription] = useState(tournament.description ?? '')
  const [location, setLocation] = useState(tournament.location ?? '')
  const [startDate, setStartDate] = useState(tournament.startDate)
  const [maxCompetitors, setMaxCompetitors] = useState(tournament.maxCompetitors)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setName(tournament.name)
      setDescription(tournament.description ?? '')
      setLocation(tournament.location ?? '')
      setStartDate(tournament.startDate)
      setMaxCompetitors(tournament.maxCompetitors)
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
        startDate,
        maxCompetitors
      })
    } catch (requestError) {
      setLoading(false)
      setError(tOrganizer(`errors.${(requestError as Error).message}`))

      return
    }

    setLoading(false)
    onSaved()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{tOrganizer('manage.editTitle')}</DialogTitle>
      <DialogContent className="edit-tournament-dialog">
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
        <TextField
          label={t('startDate')}
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('maxCompetitors')}
          type="number"
          value={maxCompetitors}
          onChange={(event) => setMaxCompetitors(Math.max(2, Number(event.target.value)))}
          fullWidth
          slotProps={{ htmlInput: { min: 2 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={loading}>
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
