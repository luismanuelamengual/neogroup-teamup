'use client'

import './index.scss'
import PaidIcon from '@mui/icons-material/Paid'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { usePlayers } from '@/app/(protected)/(tournaments)/hooks/usePlayers'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import { formatMoney } from '@/app/(protected)/(tournaments)/utils/money'
import Avatar from '@/app/components/Avatar'
import { UserDto } from '@/app/models/UserDto'
import { SubDisciplineNames } from '../../models/SubDiscipline'

interface JoinTournamentModalProps {
  open: boolean
  tournament: TournamentDto
  onClose: () => void
  onSuccess: () => void
}

export default function JoinTournamentDialog({ open, tournament, onClose, onSuccess }: JoinTournamentModalProps) {
  const { joinTournament } = useTournaments()
  const { getPlayers } = usePlayers()
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerOptions, setPartnerOptions] = useState<UserDto[]>([])
  const [partnerUser, setPartnerUser] = useState<UserDto | null>(null)
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const needsPartner = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)

  // Reset form state when modal opens.
  useEffect(() => {
    if (open) {
      setPartnerQuery('')
      setPartnerOptions([])
      setPartnerUser(null)
      setCategoryId('')
      setError(null)
      setLoading(false)
    }
  }, [open])

  // Debounced platform user search.
  useEffect(() => {
    if (partnerQuery.trim().length < 2) {
      setPartnerOptions([])

      return
    }

    setSearching(true)

    const timeout = setTimeout(async () => {
      const users = await getPlayers(partnerQuery)

      setPartnerOptions(users)
      setSearching(false)
    }, 350)

    return () => clearTimeout(timeout)
  }, [getPlayers, partnerQuery])

  // Only real categories are selectable; the single category (categoryId = null)
  // is resolved automatically by the server.
  const categories = (tournament.categories ?? []).filter((category) => category.categoryId != null)
  const hasCategories = categories.length > 0
  const isPaid = tournament.paid && !!tournament.entryFee && tournament.entryFee > 0

  const handleJoin = async () => {
    setError(null)
    setLoading(true)

    try {
      const result = await joinTournament(tournament.id, {
        partnerUserId: needsPartner ? (partnerUser?.id ?? null) : null,
        tournamentCategoryId: hasCategories && categoryId !== '' ? categoryId : null
      })

      // Paid tournaments redirect to Mercado Pago; keep the dialog in its loading
      // state until the browser navigates away.
      if (result.paid) {
        return
      }

      onSuccess()
    } catch (requestError) {
      return
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth className="join-tournament-dialog">
      <DialogContent>
        <div className="content">
          <Typography variant="h5" component="h1" className="title">
            Unirse al torneo
          </Typography>
          <div className="info">
            <Typography variant="h6" className="tournament-name">
              {tournament.name}
            </Typography>
            {tournament.description && (
              <Typography variant="body2" color="text.secondary">
                {tournament.description}
              </Typography>
            )}
            <div className="tags">
              <Chip size="small" label={DisciplineNames[tournament.discipline]} />
              {tournament.subDiscipline && <Chip size="small" label={SubDisciplineNames[tournament.subDiscipline]} />}
              <Chip size="small" label={TournamentTypeNames[tournament.type]} />
            </div>
          </div>
          {isPaid && (
            <Alert severity="info" icon={false}>
              Costo de inscripción:{' '}
              <div className="entry-fee">
                <PaidIcon fontSize="inherit" />{' '}
                <strong>{formatMoney(tournament.entryFee!, tournament.currency)}</strong>
              </div>
              . El pago se realiza de forma segura con Mercado Pago.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {hasCategories && (
            <div className="category">
              <Typography variant="subtitle1" className="category-title">
                Categoría
              </Typography>
              <TextField
                select
                value={categoryId}
                onChange={(event) => setCategoryId(Number(event.target.value))}
                placeholder="Seleccionar categoría"
                size="small"
                fullWidth
                required
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.category?.name}
                  </MenuItem>
                ))}
              </TextField>
            </div>
          )}
          {needsPartner && (
            <div className="partner">
              <Typography variant="subtitle1" className="partner-title">
                Compañero/a
              </Typography>
              <Autocomplete
                options={partnerOptions}
                value={partnerUser}
                loading={searching}
                onChange={(_, value) => setPartnerUser(value)}
                onInputChange={(_, value) => setPartnerQuery(value)}
                getOptionLabel={(option) => option.displayName}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                filterOptions={(options) => options}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <div className="join-tournament-dialog-user-option">
                      <Avatar email={option.email} name={option.displayName} size="sm" />
                      <div>
                        <div className="name">{option.displayName}</div>
                        <div className="email">{option.email}</div>
                      </div>
                    </div>
                  </li>
                )}
                renderInput={(params) => <TextField {...params} placeholder="Buscar jugador..." size="small" />}
              />
            </div>
          )}
          <Button
            variant="contained"
            size="large"
            onClick={handleJoin}
            disabled={loading || (needsPartner && !partnerUser) || (hasCategories && categoryId === '')}
            loading={loading}
          >
            {isPaid ? 'Pagar e inscribirme' : 'Confirmar inscripción'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
