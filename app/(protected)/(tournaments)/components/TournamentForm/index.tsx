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
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { Dayjs } from 'dayjs'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import {
  getDefaultRankingSettings,
  getRankingScheme,
  KNOCKOUT_STAGE_KEYS,
  knockoutStageKey,
  POSITION_COUNT,
  positionKey,
  RankingScheme,
  RankingSettings
} from '@/app/(protected)/(rankings)/models/RankingSettings'
import { useCategories } from '@/app/(protected)/(tournaments)/hooks/useCategories'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Discipline, DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { DEFAULT_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/PlayoffSettings'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline, SubDisciplineNames } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentType, TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { isDoublesDiscipline } from '@/app/(protected)/(tournaments)/utils/discipline'
import {
  DISCIPLINE_LABELS,
  ORGANIZER_ERROR_MESSAGES,
  SUB_DISCIPLINE_LABELS,
  TOURNAMENT_TYPE_LABELS
} from '../../utils/labels'

const DISCIPLINES: Discipline[] = [Discipline.PADEL, Discipline.TENNIS]
const SUB_DISCIPLINES: SubDiscipline[] = [SubDiscipline.SINGLES, SubDiscipline.DOUBLES]

export default function TournamentForm() {
  const { createTournament } = useTournaments()
  const { getCategories } = useCategories()
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.PADEL)
  const [subDiscipline, setSubDiscipline] = useState<SubDiscipline>(SubDiscipline.SINGLES)
  const [type, setType] = useState<TournamentType>(TournamentType.LEAGUE)
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>(ScoreFormat.THREE_SETS)
  const isAmericano = type === TournamentType.AMERICANO || type === TournamentType.AMERICANO_WITH_SWAP
  const [startDate, setStartDate] = useState<Dayjs | null>(null)
  const [startTime, setStartTime] = useState<Dayjs | null>(null)
  const [location, setLocation] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [categoryInput, setCategoryInput] = useState('')
  const [maxCompetitors, setMaxCompetitors] = useState(16)
  const [leagueSettings, setLeagueSettings] = useState(DEFAULT_LEAGUE_SETTINGS)
  const [americanoSettings, setAmericanoSettings] = useState(DEFAULT_AMERICANO_SETTINGS)
  const [playoffSettings] = useState(DEFAULT_PLAYOFF_SETTINGS)
  const [groupsSettings, setGroupsSettings] = useState(DEFAULT_GROUPS_PLAYOFF_SETTINGS)
  const [rankingSettings, setRankingSettings] = useState<RankingSettings>(() => getDefaultRankingSettings(type))
  const [error, setError] = useState<string | null>(null)
  const rankingScheme = getRankingScheme(type)
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
  }, [discipline, getCategories, subDiscipline])

  // Reset the ranking points to the defaults of the selected tournament type
  // whenever the type (and therefore the ranking scheme) changes.
  useEffect(() => {
    setRankingSettings(getDefaultRankingSettings(type))
  }, [type])

  const setRankingPoints = (key: string, value: number) =>
    setRankingSettings((prev) => ({ points: { ...prev.points, [key]: Math.max(0, value) } }))

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
        startDate: startDate ? startDate.format('YYYY-MM-DD') : '',
        startTime: startTime ? startTime.format('HH:mm') : null,
        location,
        categoryNames: categories.map((value) => value.trim()).filter((value) => value !== ''),
        maxCompetitors,
        // Ranking points only apply when the tournament defines categories.
        rankingSettings: categories.length > 0 ? rankingSettings : null,
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
      setError(ORGANIZER_ERROR_MESSAGES[(requestError as Error).message] ?? 'Algo salió mal. Intentá de nuevo.')

      return
    }

    router.push(`/tournaments/${createdId}`)
  }

  const isDoubles = isDoublesDiscipline(discipline, discipline === Discipline.TENNIS ? subDiscipline : null)
  const renderRankingField = (key: string, label: string) => (
    <TextField
      key={key}
      label={label}
      type="number"
      value={rankingSettings.points[key] ?? 0}
      onChange={(event) => setRankingPoints(key, Number(event.target.value))}
      fullWidth
      slotProps={{ htmlInput: { min: 0 } }}
    />
  )
  const KNOCKOUT_STAGE_LABELS: Record<string, string> = {
    finalist: 'Finalista',
    semifinalist: 'Semifinalista',
    quarterfinalist: 'Cuartodefinalista',
    round_16: 'Octavos de final',
    round_32: 'Dieciseisavos de final',
    round_64: 'Treintaidosavos de final'
  }
  const positionFields = Array.from({ length: POSITION_COUNT }, (_, i) => ({
    key: positionKey(i + 1),
    label: `Posición ${i + 1}`
  }))
  const knockoutFields = (consolation: boolean) => [
    { key: knockoutStageKey('winner', consolation), label: 'Ganador' },
    ...KNOCKOUT_STAGE_KEYS.map((stage) => ({
      key: knockoutStageKey(stage, consolation),
      label: KNOCKOUT_STAGE_LABELS[stage] ?? stage
    }))
  ]

  return (
    <Paper component="form" onSubmit={handleSubmit} className="tournament-form">
      {error && <Alert severity="error">{error}</Alert>}

      <Accordion defaultExpanded disableGutters elevation={0} className="section">
        <AccordionSummary expandIcon={<ExpandMoreIcon />} className="section-header">
          <Typography variant="subtitle1" className="title">
            Datos generales
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
          <TextField label="Nombre" value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
          <TextField
            label="Descripción"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <TextField label="Lugar" value={location} onChange={(event) => setLocation(event.target.value)} fullWidth />
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <div className="row">
              <DatePicker
                label="Fecha de inicio"
                value={startDate}
                onChange={(value) => setStartDate(value)}
                format="YYYY/MM/DD"
                slotProps={{ textField: { required: true, fullWidth: true } }}
              />
              <TimePicker
                label="Hora de inicio"
                value={startTime}
                onChange={(value) => setStartTime(value)}
                slotProps={{ textField: { fullWidth: true } }}
                ampm={false}
              />
            </div>
          </LocalizationProvider>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded disableGutters elevation={0} className="section">
        <AccordionSummary expandIcon={<ExpandMoreIcon />} className="section-header">
          <Typography variant="subtitle1" className="title">
            Configuración del torneo
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
          <div className="row">
            <TextField
              select
              label="Disciplina"
              value={discipline}
              onChange={(event) => handleDisciplineChange(Number(event.target.value) as Discipline)}
              fullWidth
            >
              {DISCIPLINES.map((value) => (
                <MenuItem key={value} value={value}>
                  {DISCIPLINE_LABELS[DisciplineNames[value]] ?? value}
                </MenuItem>
              ))}
            </TextField>
            {discipline === Discipline.TENNIS && (
              <TextField
                select
                label="Modalidad"
                value={subDiscipline}
                onChange={(event) => setSubDiscipline(Number(event.target.value) as SubDiscipline)}
                fullWidth
              >
                {SUB_DISCIPLINES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {SUB_DISCIPLINE_LABELS[SubDisciplineNames[value]] ?? value}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              select
              label="Tipo"
              value={type}
              onChange={(event) => setType(Number(event.target.value) as TournamentType)}
              fullWidth
            >
              {availableTypes.map((value) => (
                <MenuItem key={value} value={value}>
                  {TOURNAMENT_TYPE_LABELS[TournamentTypeNames[value]] ?? value}
                </MenuItem>
              ))}
            </TextField>
          </div>

          <div className="row">
            {!isAmericano && (
              <TextField
                select
                label="Formato de puntaje"
                value={scoreFormat}
                onChange={(event) => setScoreFormat(Number(event.target.value) as ScoreFormat)}
                fullWidth
              >
                <MenuItem value={ScoreFormat.THREE_SETS}>3 sets</MenuItem>
                <MenuItem value={ScoreFormat.TWO_SETS_SUPER_TIEBREAK}>2 sets + Super tiebreak</MenuItem>
              </TextField>
            )}
            <TextField
              label={isDoubles ? 'Máx. parejas' : 'Máx. competidores'}
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
                label="Puntos por presencia"
                type="number"
                value={leagueSettings.pointsPerPresent}
                onChange={(event) =>
                  setLeagueSettings({ ...leagueSettings, pointsPerPresent: Number(event.target.value) })
                }
                fullWidth
                slotProps={{ htmlInput: { min: 0 } }}
              />
              <TextField
                label="Puntos por set ganado"
                type="number"
                value={leagueSettings.pointsPerSetWon}
                onChange={(event) =>
                  setLeagueSettings({ ...leagueSettings, pointsPerSetWon: Number(event.target.value) })
                }
                fullWidth
                slotProps={{ htmlInput: { min: 0 } }}
              />
              <TextField
                label="Puntos por partido ganado"
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
                  label="Puntos por game ganado"
                  type="number"
                  value={americanoSettings.pointsPerGameWon}
                  onChange={(event) =>
                    setAmericanoSettings({ ...americanoSettings, pointsPerGameWon: Number(event.target.value) })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                  label="Puntos por partido ganado"
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
                  label="Máx. rondas"
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
                  helperText="Dejar vacío para sin límite"
                />
              </div>
            </>
          )}
          {type === TournamentType.GROUPS_PLAYOFF && (
            <>
              <div className="row">
                <TextField
                  label="Competidores por grupo"
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
                  label="Clasificados por grupo"
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
                  label="Puntos por presencia"
                  type="number"
                  value={groupsSettings.pointsPerPresent}
                  onChange={(event) =>
                    setGroupsSettings({ ...groupsSettings, pointsPerPresent: Number(event.target.value) })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                  label="Puntos por set ganado"
                  type="number"
                  value={groupsSettings.pointsPerSetWon}
                  onChange={(event) =>
                    setGroupsSettings({ ...groupsSettings, pointsPerSetWon: Number(event.target.value) })
                  }
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                  label="Puntos por partido ganado"
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
            Categorías
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
          <Alert severity="info">
            Las categorías permiten segmentar a los competidores del torneo. Podés agregar varias.
          </Alert>
          {categories.map((category, index) => (
            <div key={category} className="category-row">
              <TextField value={category} fullWidth slotProps={{ input: { readOnly: true } }} />
              <IconButton aria-label="Eliminar" onClick={() => handleRemoveCategory(index)}>
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
                  label="Categorías"
                  placeholder="Agregar categoría..."
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
              Agregar
            </Button>
          </div>
        </AccordionDetails>
      </Accordion>

      {categories.length > 0 && (
        <Accordion disableGutters elevation={0} className="section">
          <AccordionSummary expandIcon={<ExpandMoreIcon />} className="section-header">
            <Typography variant="subtitle1" className="title">
              Puntos de ranking
            </Typography>
          </AccordionSummary>
          <AccordionDetails className="section-content">
            <Alert severity="info">
              Configurá los puntos de ranking que se otorgan según la posición final en el torneo.
            </Alert>
            {rankingScheme === RankingScheme.POSITION ? (
              <div className="ranking-grid">
                {positionFields.map((field) => renderRankingField(field.key, field.label))}
              </div>
            ) : (
              <>
                {rankingScheme === RankingScheme.KNOCKOUT_WITH_CONSOLATION && (
                  <Typography variant="subtitle2" className="ranking-group-title">
                    Cuadro principal
                  </Typography>
                )}
                <div className="ranking-grid">
                  {knockoutFields(false).map((field) => renderRankingField(field.key, field.label))}
                </div>
                {rankingScheme === RankingScheme.KNOCKOUT_WITH_CONSOLATION && (
                  <>
                    <Typography variant="subtitle2" className="ranking-group-title">
                      Cuadro consuelo
                    </Typography>
                    <div className="ranking-grid">
                      {knockoutFields(true).map((field) => renderRankingField(field.key, field.label))}
                    </div>
                  </>
                )}
              </>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      <div className="actions">
        <Button onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" variant="contained" disabled={loading} loading={loading}>
          Crear torneo
        </Button>
      </div>
    </Paper>
  )
}
