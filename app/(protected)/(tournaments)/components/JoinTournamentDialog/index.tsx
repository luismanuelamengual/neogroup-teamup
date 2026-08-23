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
import SiteSelector from '@/app/(protected)/(sites)/components/SiteSelector'
import TeamRosterField, { RosterPlayer } from '@/app/(protected)/(tournaments)/components/TeamRosterField'
import { usePlayers } from '@/app/(protected)/(tournaments)/hooks/usePlayers'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { registersAsPairs, registersAsTeam } from '@/app/(protected)/(tournaments)/utils/discipline'
import { INTERCLUBS_MIN_TEAM_PLAYERS } from '@/app/(protected)/(tournaments)/utils/interclubs'
import { formatMoney } from '@/app/(protected)/(tournaments)/utils/money'
import { useUserStore } from '@/app/(protected)/stores/users'
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
  const { getPlayersForJoin } = usePlayers()
  const currentUser = useUserStore((state) => state.user)
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerOptions, setPartnerOptions] = useState<UserDto[]>([])
  const [partnerUser, setPartnerUser] = useState<UserDto | null>(null)
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [siteId, setSiteId] = useState<number | null>(null)
  const [teamMates, setTeamMates] = useState<RosterPlayer[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isTeam = registersAsTeam(tournament.type)
  const needsPartner = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)
  // The signed-in player is the captain and counts towards the minimum.
  const teamSize = teamMates.length + 1
  const teamReady = isTeam && siteId != null && teamSize >= INTERCLUBS_MIN_TEAM_PLAYERS

  // Reset form state when modal opens.
  useEffect(() => {
    if (open) {
      setPartnerQuery('')
      setPartnerOptions([])
      setPartnerUser(null)
      setCategoryId('')
      setSiteId(null)
      setTeamMates([])
      setError(null)
      setLoading(false)
    }
  }, [open])

  // Platform user search. An empty query loads a default list of players so the
  // popup isn't empty as soon as it opens; typed queries are debounced. Keyed on
  // `open` too, since reopening the dialog resets partnerQuery to '' without
  // necessarily changing it (no-op state update), which wouldn't otherwise re-run this.
  useEffect(() => {
    if (!open || !needsPartner) {
      return
    }

    const normalized = partnerQuery.trim()

    if (normalized.length === 1) {
      setPartnerOptions([])

      return
    }

    setSearching(true)

    const timeout = setTimeout(
      async () => {
        const users = await getPlayersForJoin(tournament.id, normalized)

        setPartnerOptions(users)
        setSearching(false)
      },
      normalized.length === 0 ? 0 : 350
    )

    return () => clearTimeout(timeout)
  }, [open, needsPartner, getPlayersForJoin, tournament.id, partnerQuery])

  // Only real categories are selectable; the single category (categoryId = null)
  // is resolved automatically by the server.
  const categories = (tournament.categories ?? []).filter((category) => category.categoryId != null)
  const hasCategories = categories.length > 0
  // A tournament has a cost when it defines an entry fee. That fee is settled
  // with the organizer off-platform, so it is informed here, not charged.
  const isPaid = !!tournament.entryFee && tournament.entryFee > 0
  // Rendered in a different place depending on the type (see below), so it is
  // built once here instead of being duplicated in both branches.
  const categoryField = hasCategories ? (
    <div className="category">
      <TextField
        select
        label="Categoría"
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
  ) : null

  const handleJoin = async () => {
    setError(null)
    setLoading(true)

    try {
      await joinTournament(tournament.id, {
        playerIds: isTeam ? teamMates.map((player) => player.id) : needsPartner && partnerUser ? [partnerUser.id] : [],
        siteId: isTeam ? siteId : null,
        tournamentCategoryId: hasCategories && categoryId !== '' ? categoryId : null
      })

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
              . Se abona directamente al organizador, en la cancha o por el medio que acuerden.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {/* A team registration reads as one form (sede → categoría → jugadores),
              so the category field is rendered inside that block instead of
              above it. */}
          {!isTeam && categoryField}
          {isTeam && (
            <>
              <Alert severity="info">
                Inscribís un equipo de una sede. Vos quedás como capitán del equipo y tenés que sumar al menos{' '}
                {INTERCLUBS_MIN_TEAM_PLAYERS} jugadores en total.
              </Alert>
              <div className="team">
                <SiteSelector value={siteId} onChange={setSiteId} label="Sede" required size="small" />
                {categoryField}
                <TeamRosterField
                  tournamentId={tournament.id}
                  captain={currentUser}
                  value={teamMates}
                  onChange={setTeamMates}
                />
              </div>
            </>
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
                noOptionsText={searching ? 'Buscando...' : 'No se encontraron jugadores'}
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
            disabled={
              loading ||
              (needsPartner && !partnerUser) ||
              (isTeam && !teamReady) ||
              (hasCategories && categoryId === '')
            }
            loading={loading}
          >
            {isTeam ? 'Inscribir equipo' : 'Confirmar inscripción'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
