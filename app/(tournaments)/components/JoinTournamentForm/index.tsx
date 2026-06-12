'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { UserDto } from '@/app/(auth)/models/User'
import { joinTournament, searchUsers } from '@/app/(tournaments)/actions/registration'
import { getTournamentDetail } from '@/app/(tournaments)/actions/tournament'
import { TournamentDto } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(tournaments)/utils/discipline'
import { DISCIPLINE_KEYS, SUB_DISCIPLINE_KEYS, TOURNAMENT_TYPE_KEYS } from '@/app/(tournaments)/utils/labels'

interface JoinTournamentFormProps {
  tournamentId: number
}

type PartnerMode = 'search' | 'free'

export default function JoinTournamentForm({ tournamentId }: JoinTournamentFormProps) {
  const t = useTranslations('tournaments')
  const tPlayer = useTranslations('player')
  const router = useRouter()
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [partnerMode, setPartnerMode] = useState<PartnerMode>('search')
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerOptions, setPartnerOptions] = useState<UserDto[]>([])
  const [partnerUser, setPartnerUser] = useState<UserDto | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Loads the tournament; redirects back when already registered or registration is closed.
  useEffect(() => {
    let cancelled = false

    getTournamentDetail(tournamentId).then((detail) => {
      if (cancelled) {
        return
      }

      if (!detail) {
        setInitializing(false)

        return
      }

      if (detail.userEntry || detail.tournament.status !== TournamentStatus.STAND_BY) {
        router.replace(`/tournaments/${tournamentId}`)

        return
      }

      setTournament(detail.tournament)
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
    if (partnerMode !== 'search' || partnerQuery.trim().length < 2) {
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
  }, [partnerQuery, partnerMode])

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

  const handleJoin = async () => {
    setError(null)
    setLoading(true)

    try {
      await joinTournament(tournament.id, {
        partnerUserId: needsPartner && partnerMode === 'search' ? partnerUser?.id ?? null : null,
        partnerName: needsPartner && partnerMode === 'free' ? partnerName : null
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
      <Typography variant="h5" component="h1" className="join-tournament__title">
        {tPlayer('joinTitle')}
      </Typography>
      <div className="join-tournament__info">
        <Typography variant="h6" className="join-tournament__tournament-name">
          {tournament.name}
        </Typography>
        {tournament.description && (
          <Typography variant="body2" color="text.secondary">
            {tournament.description}
          </Typography>
        )}
        <div className="join-tournament__tags">
          <Chip size="small" label={t(`discipline.${DISCIPLINE_KEYS[tournament.discipline]}`)} />
          {tournament.subDiscipline && (
            <Chip size="small" label={t(`subDiscipline.${SUB_DISCIPLINE_KEYS[tournament.subDiscipline]}`)} />
          )}
          <Chip size="small" label={t(`type.${TOURNAMENT_TYPE_KEYS[tournament.type]}`)} />
        </div>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {needsPartner && (
        <div className="join-tournament__partner">
          <Typography variant="subtitle1" className="join-tournament__partner-title">
            {tPlayer('partnerTitle')}
          </Typography>
          <RadioGroup value={partnerMode} onChange={(event) => setPartnerMode(event.target.value as PartnerMode)}>
            <FormControlLabel value="search" control={<Radio />} label={tPlayer('partnerSearchOption')} />
            <FormControlLabel value="free" control={<Radio />} label={tPlayer('partnerFreeTextOption')} />
          </RadioGroup>
          {partnerMode === 'search' ? (
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
                  <div className="join-tournament__user-option">
                    <Avatar src={option.avatarUrl} className="join-tournament__user-avatar" />
                    <div>
                      <div className="join-tournament__user-name">{option.displayName}</div>
                      <div className="join-tournament__user-email">{option.email}</div>
                    </div>
                  </div>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} placeholder={tPlayer('partnerSearchPlaceholder')} size="small" />
              )}
            />
          ) : (
            <TextField
              placeholder={tPlayer('partnerNamePlaceholder')}
              value={partnerName}
              onChange={(event) => setPartnerName(event.target.value)}
              size="small"
              fullWidth
            />
          )}
        </div>
      )}
      <Button
        variant="contained"
        size="large"
        onClick={handleJoin}
        disabled={loading || (needsPartner && (partnerMode === 'search' ? !partnerUser : !partnerName.trim()))}
      >
        {tPlayer('confirmRegistration')}
      </Button>
    </Paper>
  )
}
