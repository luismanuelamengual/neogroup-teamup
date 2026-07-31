'use client'

import 'dayjs/locale/es'
import './index.scss'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { Dayjs } from 'dayjs'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import CategorySelector from '@/app/(protected)/(categories)/components/CategorySelector'
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
import SiteSelector from '@/app/(protected)/(sites)/components/SiteSelector'
import DisciplineSelector from '@/app/(protected)/(tournaments)/components/DisciplineSelector'
import TournamentImageField from '@/app/(protected)/(tournaments)/components/TournamentImageField'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { DEFAULT_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/PlayoffSettings'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline, SubDisciplineNames, SubDisciplines } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentType, TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { isDoublesDiscipline } from '@/app/(protected)/(tournaments)/utils/discipline'
import { useOrganizationStore } from '@/app/stores/organization'

export default function TournamentForm() {
  const { createTournament } = useTournaments()
  // TeamUp's cut, as a percentage of what the tournament collects. Comes from
  // the organization store (hydrated by the protected layout) so the form states
  // the organization's real fee instead of a hard-coded one.
  const serviceFeePercentage = useOrganizationStore((state) => state.organization?.serviceFeePercentage ?? 0)
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.TENNIS)
  const [subDiscipline, setSubDiscipline] = useState<SubDiscipline>(SubDiscipline.SINGLES)
  const [type, setType] = useState<TournamentType>(TournamentType.LEAGUE)
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>(ScoreFormat.THREE_SETS)
  const isAmericano = type === TournamentType.AMERICANO || type === TournamentType.AMERICANO_WITH_SWAP
  const isInterclubs = type === TournamentType.INTERCLUBS
  const [startDate, setStartDate] = useState<Dayjs | null>(null)
  const [startTime, setStartTime] = useState<Dayjs | null>(null)
  const [startInscriptionsDate, setStartInscriptionsDate] = useState<Dayjs | null>(null)
  const [siteId, setSiteId] = useState<number | null>(null)
  // Categories added to the tournament, in the order the organizer picked them,
  // plus the catalogue they come from (the selector reports it) so the added
  // rows can show the name behind each id.
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [categoryOptions, setCategoryOptions] = useState<CategoryDto[]>([])
  const [categoryToAdd, setCategoryToAdd] = useState<number | null>(null)
  const [maxCompetitors, setMaxCompetitors] = useState(16)
  const [paid, setPaid] = useState(false)
  const [entryFee, setEntryFee] = useState<number | null>(null)
  const [allowPlayerSetScore, setAllowPlayerSetScore] = useState(false)
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
          TournamentType.GROUPS_PLAYOFF,
          // Interclubes is a tennis-only format.
          TournamentType.INTERCLUBS
        ]
  // Only tennis distinguishes singles from doubles — and not even in
  // interclubes, where a single encounter is played partly in each.
  const showSubDiscipline = discipline === Discipline.TENNIS && !isInterclubs

  // A category belongs to a specific discipline, so the ones already picked
  // stop being valid as soon as it changes.
  useEffect(() => {
    setCategoryIds([])
    setCategoryToAdd(null)
  }, [discipline])

  // Reset the ranking points to the defaults of the selected tournament type
  // whenever the type (and therefore the ranking scheme) changes.
  useEffect(() => {
    setRankingSettings(getDefaultRankingSettings(type))
  }, [type])

  const setRankingPoints = (key: string, value: number) =>
    setRankingSettings((prev) => ({ points: { ...prev.points, [key]: Math.max(0, value) } }))
  const categoryNameById = new Map(categoryOptions.map((category) => [category.id, category.name]))

  const handleAddCategory = () => {
    if (categoryToAdd === null) {
      return
    }

    setCategoryIds((prev) => (prev.includes(categoryToAdd) ? prev : [...prev, categoryToAdd]))
    setCategoryToAdd(null)
  }

  const handleRemoveCategory = (categoryId: number) => setCategoryIds((prev) => prev.filter((id) => id !== categoryId))

  const handleDisciplineChange = (value: Discipline) => {
    setDiscipline(value)

    // Each discipline offers its own types; fall back to the league when the
    // selected one is not available in the new discipline (americanos are padel
    // only, interclubes is tennis only).
    const isPadelOnly = type === TournamentType.AMERICANO || type === TournamentType.AMERICANO_WITH_SWAP
    const isTennisOnly = type === TournamentType.INTERCLUBS

    if ((value !== Discipline.PADEL && isPadelOnly) || (value !== Discipline.TENNIS && isTennisOnly)) {
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
        image,
        discipline,
        subDiscipline: showSubDiscipline ? subDiscipline : null,
        type,
        scoreFormat: isAmericano ? ScoreFormat.BASIC_COUNT : scoreFormat,
        startDate: startDate ? startDate.format('YYYY-MM-DD') : '',
        startTime: startTime ? startTime.format('HH:mm') : null,
        startInscriptionsDate: startInscriptionsDate ? startInscriptionsDate.format('YYYY-MM-DD') : null,
        siteId,
        categoryIds,
        maxCompetitors,
        entryFee: paid ? (entryFee ?? 0) : null,
        currency: 'ARS',
        allowPlayerSetScore,
        rankingSettings,
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
          <TournamentImageField value={image} onChange={setImage} />
          <TextField label="Nombre" value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
          <TextField
            label="Descripción"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <SiteSelector value={siteId} onChange={setSiteId} />
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
            <div className="row">
              <DatePicker
                label="Fecha de apertura de inscripciones"
                value={startInscriptionsDate}
                onChange={(value) => setStartInscriptionsDate(value)}
                format="YYYY/MM/DD"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    helperText: 'Opcional. Si no se completa, las inscripciones quedan abiertas desde la creación'
                  }
                }}
              />
            </div>
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
            <DisciplineSelector value={discipline} onChange={handleDisciplineChange} fullWidth />
            <TextField
              select
              label="Tipo"
              value={type}
              onChange={(event) => setType(Number(event.target.value) as TournamentType)}
              fullWidth
            >
              {availableTypes.map((value) => (
                <MenuItem key={value} value={value}>
                  {TournamentTypeNames[value]}
                </MenuItem>
              ))}
            </TextField>
            {/* Modality comes last of the three because it depends on both: it
                only applies to tennis, and not to interclubes, whose encounters
                mix singles and doubles. */}
            {showSubDiscipline && (
              <TextField
                select
                label="Modalidad"
                value={subDiscipline}
                onChange={(event) => setSubDiscipline(Number(event.target.value) as SubDiscipline)}
                fullWidth
              >
                {SubDisciplines.map((value) => (
                  <MenuItem key={value} value={value}>
                    {SubDisciplineNames[value]}
                  </MenuItem>
                ))}
              </TextField>
            )}
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
              label={isInterclubs ? 'Máx. equipos' : isDoubles ? 'Máx. parejas' : 'Máx. competidores'}
              type="number"
              value={maxCompetitors}
              onChange={(event) => setMaxCompetitors(Math.max(2, Number(event.target.value)))}
              required
              fullWidth
              slotProps={{ htmlInput: { min: 2 } }}
            />
          </div>

          {isInterclubs && (
            <Alert severity="info">
              En los torneos de Interclubes se inscriben equipos de una sede (mínimo 4 jugadores cada uno) y el formato
              se arma solo según cuántos equipos se anoten: hasta 4 equipos juegan una zona única de ida y vuelta; con
              más se arman zonas de 4 (repartiendo los equipos sobrantes entre ellas) y clasifican los 2 primeros de
              cada zona a la eliminatoria — o los 4 primeros si queda una zona única. Cada encuentro se juega a 3
              partidos.
            </Alert>
          )}

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
            Resultados
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
          <FormControlLabel
            control={
              <Switch
                checked={allowPlayerSetScore}
                onChange={(event) => setAllowPlayerSetScore(event.target.checked)}
              />
            }
            label="Permitir que los jugadores carguen el resultado de sus partidos"
          />
          <Alert severity="info">
            {allowPlayerSetScore
              ? 'Cualquiera de los jugadores de un partido podrá cargar o editar su resultado, además del organizador.'
              : 'Solo el organizador podrá cargar los resultados de los partidos.'}
          </Alert>
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
            Las categorías permiten segmentar a los competidores del torneo. Podés agregar varias de las que definió el
            administrador de tu organización.
          </Alert>
          {categoryIds.map((categoryId) => (
            <div key={categoryId} className="category-row">
              <TextField
                value={categoryNameById.get(categoryId) ?? ''}
                fullWidth
                slotProps={{ input: { readOnly: true } }}
              />
              <IconButton aria-label="Eliminar" onClick={() => handleRemoveCategory(categoryId)}>
                <DeleteOutlineIcon />
              </IconButton>
            </div>
          ))}
          <div className="category-row">
            <CategorySelector
              value={categoryToAdd}
              onChange={setCategoryToAdd}
              onOptionsChange={setCategoryOptions}
              discipline={discipline}
              excludedIds={categoryIds}
              label="Categorías"
              emptyLabel="Agregar categoría..."
            />
            <Button variant="outlined" onClick={handleAddCategory} disabled={categoryToAdd === null}>
              Agregar
            </Button>
          </div>
        </AccordionDetails>
      </Accordion>

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

      <Accordion disableGutters elevation={0} className="section">
        <AccordionSummary expandIcon={<ExpandMoreIcon />} className="section-header">
          <Typography variant="subtitle1" className="title">
            Inscripciones
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="section-content">
          <Alert severity="info">
            Elegí si la inscripción al torneo es gratuita o tiene un costo. Los jugadores se inscriben sin pagar nada
            por la plataforma: el monto lo cobrás vos directamente, en la cancha o por el medio que acuerden.
          </Alert>
          <RadioGroup value={paid ? 'paid' : 'free'} onChange={(event) => setPaid(event.target.value === 'paid')}>
            <FormControlLabel value="free" control={<Radio />} label="Gratuito" />
            <FormControlLabel value="paid" control={<Radio />} label="De pago" />
          </RadioGroup>
          {paid && (
            <>
              <TextField
                label="Monto de inscripción"
                type="number"
                value={entryFee ?? ''}
                onChange={(event) => {
                  const val = event.target.value

                  setEntryFee(val === '' ? null : Math.max(0, Number(val)))
                }}
                required
                fullWidth
                slotProps={{
                  htmlInput: { min: 0, step: '0.01' },
                  input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }
                }}
                helperText="Monto en pesos argentinos (ARS) que le cobrás a cada inscripción."
              />
              <Alert severity="info">
                <strong>¿Qué le pagás a TeamUp?</strong> Una tasa de servicio del {serviceFeePercentage}% sobre lo
                recaudado (inscriptos × monto de inscripción). Cuando el torneo comienza, el monto aparece en la sección{' '}
                <strong>Pagos</strong> de tu menú de usuario, donde lo abonás con Mercado Pago.
              </Alert>
            </>
          )}
        </AccordionDetails>
      </Accordion>

      <div className="actions">
        <Button onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" variant="contained" disabled={loading} loading={loading}>
          Crear torneo
        </Button>
      </div>
    </Paper>
  )
}
