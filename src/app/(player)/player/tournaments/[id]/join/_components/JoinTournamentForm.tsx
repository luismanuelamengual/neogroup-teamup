'use client'

import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { joinTournament, searchUsers } from '@/app/_actions/registration.actions'
import { TournamentDto, UserDto } from '@/app/_models/dtos'

import './JoinTournamentForm.styles.scss'

interface JoinTournamentFormProps {
  tournament: TournamentDto
  needsPartner: boolean
}

type PartnerMode = 'search' | 'free'

export default function JoinTournamentForm({ tournament, needsPartner }: JoinTournamentFormProps) {
  const t = useTranslations('tournaments')
  const tPlayer = useTranslations('player')
  const router = useRouter()
  const [partnerMode, setPartnerMode] = useState<PartnerMode>('search')
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerOptions, setPartnerOptions] = useState<UserDto[]>([])
  const [partnerUser, setPartnerUser] = useState<UserDto | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

  const handleJoin = async () => {
    setError(null)
    setLoading(true)

    const result = await joinTournament(tournament.id, {
      partnerUserId: needsPartner && partnerMode === 'search' ? partnerUser?.id ?? null : null,
      partnerName: needsPartner && partnerMode === 'free' ? partnerName : null
    })

    if (!result.success) {
      setLoading(false)
      setError(tPlayer(`errors.${result.error ?? 'notFound'}`))

      return
    }

    router.push(`/player/tournaments/${tournament.id}`)
    router.refresh()
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
          <Chip size="small" label={t(`discipline.${tournament.discipline}`)} />
          <Chip size="small" label={t(`type.${tournament.type}`)} />
        </div>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {needsPartner && (
        <div className="join-tournament__partner">
          <Typography variant="subtitle1" className="join-tournament__partner-title">
            {tPlayer('partnerTitle')}
          </Typography>
          <RadioGroup
            value={partnerMode}
            onChange={(event) => setPartnerMode(event.target.value as PartnerMode)}
          >
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
        disabled={
          loading || (needsPartner && (partnerMode === 'search' ? !partnerUser : !partnerName.trim()))
        }
      >
        {tPlayer('confirmRegistration')}
      </Button>
    </Paper>
  )
}
