'use client'

import './TournamentForm.styles.scss'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { createTournament } from '@/app/_actions/tournament'
import {
  DEFAULT_AMERICANO_SETTINGS,
  DEFAULT_LEAGUE_SETTINGS,
  Discipline,
  ScoreFormat,
  TournamentType
} from '@/app/_models/types'

const DISCIPLINES: Discipline[] = ['padel', 'tennis', 'tennis_doubles']

export default function TournamentForm() {
  const t = useTranslations('tournaments')
  const tOrganizer = useTranslations('organizer')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discipline, setDiscipline] = useState<Discipline>('padel')
  const [type, setType] = useState<TournamentType>('league')
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>('three_sets')
  const [startDate, setStartDate] = useState('')
  const [location, setLocation] = useState('')
  const [maxCompetitors, setMaxCompetitors] = useState(8)
  const [leagueSettings, setLeagueSettings] = useState(DEFAULT_LEAGUE_SETTINGS)
  const [americanoSettings, setAmericanoSettings] = useState(DEFAULT_AMERICANO_SETTINGS)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const availableTypes: TournamentType[] =
    discipline === 'padel' ? ['league', 'americano', 'playoff'] : ['league', 'playoff']

  const handleDisciplineChange = (value: Discipline) => {
    setDiscipline(value)

    if (value !== 'padel' && type === 'americano') {
      setType('league')
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const result = await createTournament({
      name,
      description,
      discipline,
      type,
      scoreFormat,
      startDate,
      location,
      maxCompetitors,
      settings: type === 'league' ? leagueSettings : type === 'americano' ? americanoSettings : {}
    })

    if (!result.success || !result.id) {
      setLoading(false)
      setError(tOrganizer(`errors.${result.error ?? 'missingFields'}`))

      return
    }

    router.push(`/organizer/tournaments/${result.id}`)
  }

  const isDoubles = discipline === 'padel' || discipline === 'tennis_doubles'

  return (
    <Paper component="form" onSubmit={handleSubmit} className="tournament-form">
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label={t('name')} value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
      <TextField
        label={t('description')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        multiline
        minRows={2}
        fullWidth
      />
      <div className="tournament-form__row">
        <TextField
          select
          label={t('discipline.label')}
          value={discipline}
          onChange={(event) => handleDisciplineChange(event.target.value as Discipline)}
          fullWidth
        >
          {DISCIPLINES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`discipline.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label={t('type.label')}
          value={type}
          onChange={(event) => setType(event.target.value as TournamentType)}
          fullWidth
        >
          {availableTypes.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`type.${value}`)}
            </MenuItem>
          ))}
        </TextField>
      </div>
      <div className="tournament-form__row">
        <TextField
          label={t('startDate')}
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          required
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('location')}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          fullWidth
        />
      </div>
      <div className="tournament-form__row">
        <TextField
          select
          label={t('scoreFormat.label')}
          value={scoreFormat}
          onChange={(event) => setScoreFormat(event.target.value as ScoreFormat)}
          fullWidth
        >
          <MenuItem value="three_sets">{t('scoreFormat.three_sets')}</MenuItem>
          <MenuItem value="two_sets_super_tiebreak">{t('scoreFormat.two_sets_super_tiebreak')}</MenuItem>
          <MenuItem value="basic_count">{t('scoreFormat.basic_count')}</MenuItem>
        </TextField>
        <TextField
          label={isDoubles ? t('maxTeams') : t('maxCompetitors')}
          type="number"
          value={maxCompetitors}
          onChange={(event) => setMaxCompetitors(Math.max(2, Number(event.target.value)))}
          required
          fullWidth
          slotProps={{ htmlInput: { min: 2 } }}
        />
      </div>
      {type === 'league' && (
        <div className="tournament-form__settings">
          <Typography variant="subtitle2">{t('settings.title')}</Typography>
          <div className="tournament-form__row">
            <TextField
              label={t('settings.pointsPerPresent')}
              type="number"
              value={leagueSettings.pointsPerPresent}
              onChange={(event) =>
                setLeagueSettings({ ...leagueSettings, pointsPerPresent: Number(event.target.value) })
              }
              fullWidth
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <TextField
              label={t('settings.pointsPerSetWon')}
              type="number"
              value={leagueSettings.pointsPerSetWon}
              onChange={(event) =>
                setLeagueSettings({ ...leagueSettings, pointsPerSetWon: Number(event.target.value) })
              }
              fullWidth
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <TextField
              label={t('settings.pointsPerMatchWon')}
              type="number"
              value={leagueSettings.pointsPerMatchWon}
              onChange={(event) =>
                setLeagueSettings({ ...leagueSettings, pointsPerMatchWon: Number(event.target.value) })
              }
              fullWidth
              slotProps={{ htmlInput: { min: 0 } }}
            />
          </div>
        </div>
      )}
      {type === 'americano' && (
        <div className="tournament-form__settings">
          <Typography variant="subtitle2">{t('settings.title')}</Typography>
          <div className="tournament-form__row">
            <TextField
              label={t('settings.pointsPerGameWon')}
              type="number"
              value={americanoSettings.pointsPerGameWon}
              onChange={(event) =>
                setAmericanoSettings({ ...americanoSettings, pointsPerGameWon: Number(event.target.value) })
              }
              fullWidth
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <TextField
              label={t('settings.pointsPerMatchWon')}
              type="number"
              value={americanoSettings.pointsPerMatchWon}
              onChange={(event) =>
                setAmericanoSettings({ ...americanoSettings, pointsPerMatchWon: Number(event.target.value) })
              }
              fullWidth
              slotProps={{ htmlInput: { min: 0 } }}
            />
          </div>
          <FormControlLabel
            control={
              <Switch
                checked={americanoSettings.swapPartnersEachRound}
                onChange={(event) =>
                  setAmericanoSettings({ ...americanoSettings, swapPartnersEachRound: event.target.checked })
                }
              />
            }
            label={t('settings.swapPartnersEachRound')}
          />
        </div>
      )}
      <div className="tournament-form__actions">
        <Button onClick={() => router.back()}>{tCommon('cancel')}</Button>
        <Button type="submit" variant="contained" disabled={loading}>
          {tOrganizer('create')}
        </Button>
      </div>
    </Paper>
  )
}
