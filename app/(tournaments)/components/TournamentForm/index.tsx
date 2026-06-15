'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { createTournament } from '@/app/(tournaments)/actions/tournament'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(tournaments)/models/AmericanoSettings'
import { Discipline } from '@/app/(tournaments)/models/Discipline'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(tournaments)/models/LeagueSettings'
import { ScoreFormat } from '@/app/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(tournaments)/models/SubDiscipline'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'
import { isDoublesDiscipline } from '@/app/(tournaments)/utils/discipline'
import { DISCIPLINE_KEYS, SUB_DISCIPLINE_KEYS, TOURNAMENT_TYPE_KEYS } from '@/app/(tournaments)/utils/labels'

const DISCIPLINES: Discipline[] = [Discipline.PADEL, Discipline.TENNIS]
const SUB_DISCIPLINES: SubDiscipline[] = [SubDiscipline.SINGLES, SubDiscipline.DOUBLES]

export default function TournamentForm() {
  const t = useTranslations('tournaments')
  const tOrganizer = useTranslations('organizer')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.PADEL)
  const [subDiscipline, setSubDiscipline] = useState<SubDiscipline>(SubDiscipline.SINGLES)
  const [type, setType] = useState<TournamentType>(TournamentType.LEAGUE)
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>(ScoreFormat.THREE_SETS)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [location, setLocation] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [maxCompetitors, setMaxCompetitors] = useState(8)
  const [leagueSettings, setLeagueSettings] = useState(DEFAULT_LEAGUE_SETTINGS)
  const [americanoSettings, setAmericanoSettings] = useState(DEFAULT_AMERICANO_SETTINGS)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const availableTypes: TournamentType[] =
    discipline === Discipline.PADEL
      ? [TournamentType.LEAGUE, TournamentType.AMERICANO, TournamentType.PLAYOFF]
      : [TournamentType.LEAGUE, TournamentType.PLAYOFF]

  const handleDisciplineChange = (value: Discipline) => {
    setDiscipline(value)

    if (value !== Discipline.PADEL && type === TournamentType.AMERICANO) {
      setType(TournamentType.LEAGUE)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    let createdId: number

    try {
      const created = await createTournament({
        name,
        description,
        discipline,
        subDiscipline: discipline === Discipline.TENNIS ? subDiscipline : null,
        type,
        scoreFormat,
        startDate,
        startTime: startTime || null,
        location,
        categories: categories.map((value) => value.trim()).filter((value) => value !== ''),
        maxCompetitors,
        settings:
          type === TournamentType.LEAGUE ? leagueSettings : type === TournamentType.AMERICANO ? americanoSettings : {}
      })

      createdId = created.id
    } catch (requestError) {
      setLoading(false)
      setError(tOrganizer(`errors.${(requestError as Error).message}`))

      return
    }

    router.push(`/tournaments/${createdId}`)
  }

  const handleAddCategory = () => setCategories((prev) => [...prev, ''])
  const handleCategoryChange = (index: number, value: string) =>
    setCategories((prev) => prev.map((category, i) => (i === index ? value : category)))
  const handleRemoveCategory = (index: number) => setCategories((prev) => prev.filter((_, i) => i !== index))
  const isDoubles = isDoublesDiscipline(discipline, discipline === Discipline.TENNIS ? subDiscipline : null)

  return (
    <Paper component="form" onSubmit={handleSubmit} className="tournament-form">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="row">
        <TextField
          select
          label={t('discipline.label')}
          value={discipline}
          onChange={(event) => handleDisciplineChange(Number(event.target.value) as Discipline)}
          fullWidth
        >
          {DISCIPLINES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`discipline.${DISCIPLINE_KEYS[value]}`)}
            </MenuItem>
          ))}
        </TextField>
        {discipline === Discipline.TENNIS && (
          <TextField
            select
            label={t('subDiscipline.label')}
            value={subDiscipline}
            onChange={(event) => setSubDiscipline(Number(event.target.value) as SubDiscipline)}
            fullWidth
          >
            {SUB_DISCIPLINES.map((value) => (
              <MenuItem key={value} value={value}>
                {t(`subDiscipline.${SUB_DISCIPLINE_KEYS[value]}`)}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          label={t('type.label')}
          value={type}
          onChange={(event) => setType(Number(event.target.value) as TournamentType)}
          fullWidth
        >
          {availableTypes.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`type.${TOURNAMENT_TYPE_KEYS[value]}`)}
            </MenuItem>
          ))}
        </TextField>
      </div>
      <TextField label={t('name')} value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
      <TextField
        label={t('description')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        multiline
        minRows={2}
        fullWidth
      />

      <div className="row">
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
          required
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('startTime')}
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </div>
      <div className="row">
        <TextField
          select
          label={t('scoreFormat.label')}
          value={scoreFormat}
          onChange={(event) => setScoreFormat(Number(event.target.value) as ScoreFormat)}
          fullWidth
        >
          <MenuItem value={ScoreFormat.THREE_SETS}>{t('scoreFormat.three_sets')}</MenuItem>
          <MenuItem value={ScoreFormat.TWO_SETS_SUPER_TIEBREAK}>{t('scoreFormat.two_sets_super_tiebreak')}</MenuItem>
          <MenuItem value={ScoreFormat.BASIC_COUNT}>{t('scoreFormat.basic_count')}</MenuItem>
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

      {type === TournamentType.LEAGUE && (
        <div className="settings">
          <Typography variant="subtitle2">{t('settings.title')}</Typography>
          <div className="row">
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
      {type === TournamentType.AMERICANO && (
        <div className="settings">
          <Typography variant="subtitle2">{t('settings.title')}</Typography>
          <div className="row">
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
      <div className="settings categories">
        <Typography variant="subtitle2">{t('categories')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('categoriesHint')}
        </Typography>
        {categories.map((category, index) => (
          <div key={index} className="category-row">
            <TextField
              label={t('categoryNumber', { number: index + 1 })}
              value={category}
              onChange={(event) => handleCategoryChange(index, event.target.value)}
              fullWidth
            />
            <IconButton aria-label={tCommon('delete')} onClick={() => handleRemoveCategory(index)}>
              <DeleteOutlineIcon />
            </IconButton>
          </div>
        ))}
        <Button startIcon={<AddIcon />} onClick={handleAddCategory}>
          {t('addCategory')}
        </Button>
      </div>
      <div className="actions">
        <Button onClick={() => router.back()}>{tCommon('cancel')}</Button>
        <Button type="submit" variant="contained" disabled={loading}>
          {tOrganizer('create')}
        </Button>
      </div>
    </Paper>
  )
}
