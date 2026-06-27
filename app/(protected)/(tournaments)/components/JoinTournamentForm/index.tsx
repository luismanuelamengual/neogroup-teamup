'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import Avatar from '@/app/components/Avatar'
import { useUsers } from '@/app/hooks/useUsers'
import { UserDto } from '@/app/models/UserDto'
import { useUserStore } from '@/app/stores/users'
import { SubDisciplineNames } from '../../models/SubDiscipline'
import {
  DISCIPLINE_LABELS,
  PLAYER_ERROR_MESSAGES,
  SUB_DISCIPLINE_LABELS,
  TOURNAMENT_TYPE_LABELS
} from '../../utils/labels'

interface JoinTournamentFormProps {
  tournamentId: number
}

export default function JoinTournamentForm({ tournamentId }: JoinTournamentFormProps) {
  const { getTournament, joinTournament } = useTournaments()
  const { getUsers } = useUsers()
  const router = useRouter()
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const userId = useUserStore((state) => state.user?.id ?? null)
  const [initializing, setInitializing] = useState(true)
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerOptions, setPartnerOptions] = useState<UserDto[]>([])
  const [partnerUser, setPartnerUser] = useState<UserDto | null>(null)
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Loads the tournament; redirects back when already registered or registration is closed.
  useEffect(() => {
    let cancelled = false

    getTournament(tournamentId).then((detail) => {
      if (cancelled) {
        return
      }

      if (!detail) {
        setInitializing(false)

        return
      }

      const alreadyRegistered =
        detail.competitors?.some((c) => c.userId === userId || c.partnerUserId === userId) ?? false

      if (alreadyRegistered || detail.status !== TournamentStatus.STAND_BY) {
        router.replace(`/tournaments/${tournamentId}`)

        return
      }

      setTournament(detail)
      setInitializing(false)
    })

    return () => {
      cancelled = true
    }
  }, [tournamentId, router, userId, getTournament])

  const needsPartner = tournament
    ? registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)
    : false

  // Debounced platform user search.
  useEffect(() => {
    if (partnerQuery.trim().length < 2) {
      setPartnerOptions([])

      return
    }

    setSearching(true)

    const timeout = setTimeout(async () => {
      const users = await getUsers(partnerQuery)

      setPartnerOptions(users)
      setSearching(false)
    }, 350)

    return () => clearTimeout(timeout)
  }, [getUsers, partnerQuery])

  if (initializing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <CircularProgress />
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">{PLAYER_ERROR_MESSAGES['notFound'] ?? 'Torneo no encontrado'}</Alert>
  }

  // Only real categories are selectable; the single category (categoryId = null)
  // is resolved automatically by the server.
  const categories = (tournament.categories ?? []).filter((category) => category.categoryId != null)
  const hasCategories = categories.length > 0

  const handleJoin = async () => {
    setError(null)
    setLoading(true)

    try {
      await joinTournament(tournament.id, {
        partnerUserId: needsPartner ? (partnerUser?.id ?? null) : null,
        tournamentCategoryId: hasCategories && categoryId !== '' ? categoryId : null
      })
    } catch (requestError) {
      setLoading(false)
      setError(PLAYER_ERROR_MESSAGES[(requestError as Error).message] ?? 'Algo salió mal. Intentá de nuevo.')

      return
    }

    router.push(`/tournaments/${tournament.id}`)
  }

  return (
    <Paper className="join-tournament">
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
          <Chip
            size="small"
            label={DISCIPLINE_LABELS[DisciplineNames[tournament.discipline]] ?? tournament.discipline}
          />
          {tournament.subDiscipline && (
            <Chip
              size="small"
              label={SUB_DISCIPLINE_LABELS[SubDisciplineNames[tournament.subDiscipline]] ?? tournament.subDiscipline}
            />
          )}
          <Chip size="small" label={TOURNAMENT_TYPE_LABELS[TournamentTypeNames[tournament.type]] ?? tournament.type} />
        </div>
      </div>
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
                <div className="join-tournament-user-option">
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
        Confirmar inscripción
      </Button>
    </Paper>
  )
}
