'use client'

import './index.scss'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FormEvent, useEffect, useState } from 'react'
import { createTournament, getCategories } from '@/app/(protected)/(tournaments)/actions/tournament'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Discipline, DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { DEFAULT_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/PlayoffSettings'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline, SubDisciplineNames } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentType, TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { isDoublesDiscipline } from '@/app/(protected)/(tournaments)/utils/discipline'

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
  const isAmericano = type === TournamentType.AMERICANO || type === TournamentType.AMERICANO_WITH_SWAP
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [location, setLocation] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [categoryInput, setCategoryInput] = useState('')
  const [maxCompetitors, setMaxCompetitors] = useState(16)
  const [leagueSettings, setLeagueSettings] = useState(DEFAULT_LEAGUE_SETTINGS)
  const [americanoSettings, setAmericanoSettings] = useState(DEFAULT_AMERICANO_SETTINGS)
  const [playoffSettings] = useState(DEFAULT_PLAYOFF_SETTINGS)
  const [groupsSettings, setGroupsSettings] = useState(DEFAULT_GROUPS_PLAYOFF_SETTINGS)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const availableTypes: TournamentType[] =
    discipline === Discipline.PADEL
      ? [
          TournamentType.LEAGUE,
          TournamentType.AMERICANO,
          TournamentType.AMERICANO_WITH_SWAP,
          TournamentType.PLAYOFF,
          TournamentType.PLAYOFF_WITH_CONSOLATION,
          TournamentType.GROUPS_PLAYOFF
        ]
      : [
          TournamentType.LEAGUE,
          TournamentType.PLAYOFF,
          TournamentType.PLAYOFF_WITH_CONSOLATION,
          TournamentType.GROUPS_PLAYOFF
        ]

  // Load existing categories for the current discipline / sub-discipline so the
  // organizer can pick from previously used ones (still able to type new ones).
  // Changing discipline/sub-discipline resets the categories already added,
  // since a category belongs to a specific discipline + sub-discipline.
  useEffect(() => {
    let cancelled = false
    const sub = discipline === Discipline.TENNIS ? subDiscipline : null

    setCategories([])
    setCategoryInput('')

    getCategories(discipline, sub)
      .then((options) => {
        if (!cancelled) {
          setCategoryOptions(options.map((option) => option.name))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryOptions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [discipline, subDiscipline])

  const handleAddCategory = () => {
    const value = categoryInput.trim()

    if (value === '') {
      return
    }

    setCategories((prev) =>
      prev.some((category) => category.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value]
    )
    setCategoryInput('')
  }

  const handleRemoveCategory = (index: number) => setCategories((prev) => prev.filter((_, i) => i !== index))

  const handleDisciplineChange = (value: Discipline) => {
    setDiscipline(value)

    if (
      value !== Discipline.PADEL &&
      (type === TournamentType.AMERICANO || type === TournamentType.AMERICANO_WITH_SWAP)
    ) {
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
        scoreFormat: isAmericano ? ScoreFormat.BASIC_COUNT : scoreFormat,
        startDate,
        startTime: startTime || null,
        location,
        categoryNames: categories.map((value) => value.trim()).filter((value) => value !== ''),
        maxCompetitors,
        settings:
          type === TournamentType.LEAGUE
            ? leagueSettings
            : type === TournamentType.AMERICANO || type === TournamentType.AMERICANO_WITH_SWAP
              ? americanoSettings
              : type === TournamentType.PLAYOFF || type === TournamentType.PLAYOFF_WITH_CONSOLATION
                ? playoffSettings
                : type === TournamentType.GROUPS_PLAYOFF
                  ? groupsSettings
                  : {}
      })

      createdId = created.id
    } catch (requestError) {
      setLoading(false)
      setError(tOrganizer(`errors.${(requestError as Error).message}`))

      return
    }

    router.push(`/tournaments/${createdId}`)
  }

  const isDoubles = isDoublesDiscipline(discipline, discipline === Discipline.TENNIS ? subDiscipline : null)

  return (
    <Paper component="form" onSubmit={handleSubmit} className="tournament-form">
      {error && <Alert severity="error">{error}</Alert>}

      <Accordion defaultExpanded disableGutters elevation={0} className="section">
        <AccordionSummary expandIcon={<ExpandMoreIcon />} className="section-header">
          <Typography variant="subtitle1" className="title">
            {t('sections.generalData')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
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
                  {t(`discipline.${DisciplineNames[value]}`)}
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
                    {t(`subDiscipline.${SubDisciplineNames[value]}`)}
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
                  {t(`type.${TournamentTypeNames[value]}`)}
                </MenuItem>
              ))}
            </TextField>
          </div>
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
          <div className="row">
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
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters elevation={0} className="section">
        <AccordionSummary expandIcon={<ExpandMoreIcon />} className="section-header">
          <Typography variant="subtitle1" className="title">
            {t('sections.advancedSettings')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
          {type === TournamentType.GROUPS_PLAYOFF && <Alert severity="info">{t('settings.groupsPlayoffHint')}</Alert>}

          <div className="row">
            {!isAmericano && (
              <TextField
                select
                label={t('scoreFormat.label')}
                value={scoreFormat}
                onChange={(event) => setScoreFormat(Number(event.target.value) as ScoreFormat)}
                fullWidth
              >
                <MenuItem value={ScoreFormat.THREE_SETS}>{t('scoreFormat.three_sets')}</MenuItem>
                <MenuItem value={ScoreFormat.TWO_SETS_SUPER_TIEBREAK}>
                  {t('scoreFormat.two_sets_super_tiebreak')}
                </MenuItem>
              </TextField>
            )}
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
          )}
          {isAmericano && (
            <>
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
              <div className="row">
                <TextField
                  label={t('settings.maxRounds')}
                  type="number"
                  value={americanoSettings.maxRounds ?? ''}
                  onChange={(event) => {
                    const val = event.target.value

                    setAmericanoSettings({
                      ...americanoSettings,
                      maxRounds: val === '' ? undefined : Math.max(1, Number(val))
                    })
                  }}
                  fullWidth
                  slotProps={{ htmlInput: { min: 1 } }}
                  helperText={t('settings.maxRoundsHint')}
                />
              </div>
            </>
          )}
          {type === TournamentType.GROUPS_PLAYOFF && (
            <>
              <div className="row">
                <TextField
                  label={t('settings.competitorsPerGroup')}
                  type="number"
                  value={groupsSettings.competitorsPerGroup}
                  onChange={(event) =>
                    setGroupsSettings({
                      ...groupsSettings,
                      competitorsPerGroup: Math.max(2, Number(event.target.value))
                    })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 2 } }}
                />
                <TextField
                  label={t('settings.qualifiersPerGroup')}
                  type="number"
                  value={groupsSettings.qualifiersPerGroup}
                  onChange={(event) =>
                    setGroupsSettings({
                      ...groupsSettings,
                      qualifiersPerGroup: Math.max(1, Number(event.target.value))
                    })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 1 } }}
                />
              </div>
              <div className="row">
                <TextField
                  label={t('settings.pointsPerPresent')}
                  type="number"
                  value={groupsSettings.pointsPerPresent}
                  onChange={(event) =>
                    setGroupsSettings({ ...groupsSettings, pointsPerPresent: Number(event.target.value) })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                  label={t('settings.pointsPerSetWon')}
                  type="number"
                  value={groupsSettings.pointsPerSetWon}
                  onChange={(event) =>
                    setGroupsSettings({ ...groupsSettings, pointsPerSetWon: Number(event.target.value) })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                  label={t('settings.pointsPerMatchWon')}
                  type="number"
                  value={groupsSettings.pointsPerMatchWon}
                  onChange={(event) =>
                    setGroupsSettings({ ...groupsSettings, pointsPerMatchWon: Number(event.target.value) })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </div>
            </>
          )}
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters elevation={0} className="section">
        <AccordionSummary expandIcon={<ExpandMoreIcon />} className="section-header">
          <Typography variant="subtitle1" className="title">
            {t('categories')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
          <Alert severity="info">{t('categoriesHint')}</Alert>
          {categories.map((category, index) => (
            <div key={category} className="category-row">
              <TextField value={category} fullWidth slotProps={{ input: { readOnly: true } }} />
              <IconButton aria-label={tCommon('delete')} onClick={() => handleRemoveCategory(index)}>
                <DeleteOutlineIcon />
              </IconButton>
            </div>
          ))}
          <div className="category-row">
            <Autocomplete
              freeSolo
              fullWidth
              options={categoryOptions.filter(
                (option) => !categories.some((category) => category.toLowerCase() === option.toLowerCase())
              )}
              inputValue={categoryInput}
              onInputChange={(_event, value) => setCategoryInput(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('categories')}
                  placeholder={t('addCategory')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddCategory()
                    }
                  }}
                />
              )}
            />
            <Button variant="outlined" onClick={handleAddCategory} disabled={categoryInput.trim() === ''}>
              {tCommon('add')}
            </Button>
          </div>
        </AccordionDetails>
      </Accordion>

      <div className="actions">
        <Button onClick={() => router.back()}>{tCommon('cancel')}</Button>
        <Button type="submit" variant="contained" disabled={loading}>
          {tOrganizer('create')}
        </Button>
      </div>
    </Paper>
  )
}
