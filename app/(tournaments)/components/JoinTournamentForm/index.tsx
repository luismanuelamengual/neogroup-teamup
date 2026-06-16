'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { UserDto } from '@/app/(auth)/models/UserDto'
import { searchUsers } from '@/app/(auth)/services/users'
import { useUserStore } from '@/app/(auth)/stores/users'
import { getTournament, joinTournament } from '@/app/(tournaments)/actions/tournament'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(tournaments)/utils/discipline'
import { DISCIPLINE_KEYS, SUB_DISCIPLINE_KEYS, TOURNAMENT_TYPE_KEYS } from '@/app/(tournaments)/utils/labels'

interface JoinTournamentFormProps {
  tournamentId: number
}

export default function JoinTournamentForm({ tournamentId }: JoinTournamentFormProps) {
  const t = useTranslations('tournaments')
  const tPlayer = useTranslations('player')
  const router = useRouter()
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const userId = useUserStore((state) => state.user?.id ?? null)
  const [initializing, setInitializing] = useState(true)
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerOptions, setPartnerOptions] = useState<UserDto[]>([])
  const [partnerUser, setPartnerUser] = useState<UserDto | null>(null)
  const [category, setCategory] = useState('')
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
  }, [tournamentId, router])

  const needsPartner = tournament
    ? registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type, tournament.settings ?? {})
    : false

  // Debounced platform user search.
  useEffect(() => {
    if (partnerQuery.trim().length < 2) {
      setPartnerOptions([])

      return
    }

    setSearching(true)

    const timeout = setTimeout(async () => {
      const users = await searchUsers(partnerQuery)

      setPartnerOptions(users)
      setSearching(false)
    }, 350)

    return () => clearTimeout(timeout)
  }, [partnerQuery])

  if (initializing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <CircularProgress />
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">{tPlayer('errors.notFound')}</Alert>
  }

  const categories = tournament.categories ?? []
  const hasCategories = categories.length > 0

  const handleJoin = async () => {
    setError(null)
    setLoading(true)

    try {
      await joinTournament(tournament.id, {
        partnerUserId: needsPartner ? partnerUser?.id ?? null : null,
        category: hasCategories ? category : null
      })
    } catch (requestError) {
      setLoading(false)
      setError(tPlayer(`errors.${(requestError as Error).message}`))

      return
    }

    router.push(`/tournaments/${tournament.id}`)
  }

  return (
    <Paper className="join-tournament">
      <Typography variant="h5" component="h1" className="title">
        {tPlayer('joinTitle')}
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
          <Chip size="small" label={t(`discipline.${DISCIPLINE_KEYS[tournament.discipline]}`)} />
          {tournament.subDiscipline && (
            <Chip size="small" label={t(`subDiscipline.${SUB_DISCIPLINE_KEYS[tournament.subDiscipline]}`)} />
          )}
          <Chip size="small" label={t(`type.${TOURNAMENT_TYPE_KEYS[tournament.type]}`)} />
        </div>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {hasCategories && (
        <div className="category">
          <Typography variant="subtitle1" className="category-title">
            {t('category')}
          </Typography>
          <TextField
            select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={tPlayer('selectCategory')}
            size="small"
            fullWidth
            required
          >
            {categories.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        </div>
      )}
      {needsPartner && (
        <div className="partner">
          <Typography variant="subtitle1" className="partner-title">
            {tPlayer('partnerTitle')}
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
                  <Avatar src={option.avatarUrl} className="avatar" />
                  <div>
                    <div className="name">{option.displayName}</div>
                    <div className="email">{option.email}</div>
                  </div>
                </div>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} placeholder={tPlayer('partnerSearchPlaceholder')} size="small" />
            )}
          />
        </div>
      )}
      <Button
        variant="contained"
        size="large"
        onClick={handleJoin}
        disabled={loading || (needsPartner && !partnerUser) || (hasCategories && !category)}
      >
        {tPlayer('confirmRegistration')}
      </Button>
    </Paper>
  )
}
