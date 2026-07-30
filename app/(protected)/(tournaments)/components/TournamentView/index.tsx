'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EditIcon from '@mui/icons-material/Edit'
import EventNoteIcon from '@mui/icons-material/EventNote'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import PaidIcon from '@mui/icons-material/Paid'
import PlaceIcon from '@mui/icons-material/Place'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SettingsIcon from '@mui/icons-material/Settings'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMercadoPago } from '@/app/(protected)/(account)/hooks/useMercadoPago'
import CompetitorsList from '@/app/(protected)/(tournaments)/components/CompetitorsList'
import EditTournamentDialog from '@/app/(protected)/(tournaments)/components/EditTournamentDialog'
import JoinTournamentDialog from '@/app/(protected)/(tournaments)/components/JoinTournamentDialog'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import ScoreDialog from '@/app/(protected)/(tournaments)/components/ScoreDialog'
import StatusChip from '@/app/(protected)/(tournaments)/components/StatusChip'
import TournamentRoundsView from '@/app/(protected)/(tournaments)/components/TournamentRoundsView'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { PaymentStatus } from '@/app/(protected)/(tournaments)/models/PaymentStatus'
import { ScoreFormatNames } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDisciplineNames } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType, TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { dataUrlToFile } from '@/app/(protected)/(tournaments)/utils/image'
import { describeInterclubsFormat } from '@/app/(protected)/(tournaments)/utils/interclubs'
import { isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { formatMoney } from '@/app/(protected)/(tournaments)/utils/money'
import { isRegistrationOpen } from '@/app/(protected)/(tournaments)/utils/registrations'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useUserStore } from '@/app/stores/users'

interface TournamentViewProps {
  tournamentId: number
  appUrl: string
  // Anyone with the organizer role can administer any tournament, regardless
  // of who created it. This flag toggles between the management UI and the
  // player/competitor UI.
  isOrganizer: boolean
}

export default function TournamentView({ tournamentId, appUrl, isOrganizer }: TournamentViewProps) {
  const { finishTournament, getPaymentStatus, getTournament, leaveTournament, saveMatchResult, startTournament } =
    useTournaments()
  const { getStatus } = useMercadoPago()
  const { showSuccessMessage, showWarningMessage, showErrorMessage } = useNotifications()
  const router = useRouter()
  const searchParams = useSearchParams()
  const paymentHandled = useRef(false)
  const joinLinkHandled = useRef(false)
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [scoreMatch, setScoreMatch] = useState<MatchDto | null>(null)
  const [working, setWorking] = useState(false)
  const [confirmStartOpen, setConfirmStartOpen] = useState(false)
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  const [mpConnected, setMpConnected] = useState<boolean | null>(null)
  const userId = useUserStore((state) => state.user?.id ?? null)
  const competitors = useMemo(() => tournament?.competitors ?? [], [tournament])
  const matches = useMemo(() => tournament?.matches ?? [], [tournament])
  const categories = useMemo(() => tournament?.categories ?? [], [tournament])
  const categoryKeys = useMemo<number[]>(() => categories.map((category) => category.id), [categories])
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.category?.name ?? null])),
    [categories]
  )
  const maxByCategory = useMemo(
    () => new Map(categories.map((category) => [category.id, category.maxCompetitors])),
    [categories]
  )
  const userEntry = useMemo(
    () => competitors.find((c) => userId != null && c.playerIds.includes(userId)) ?? null,
    [competitors, userId]
  )
  // Registrations are open unless the tournament sets a future startInscriptionsDate.
  const registrationOpen = useMemo(() => isRegistrationOpen(tournament?.startInscriptionsDate), [tournament])
  const myMatches = useMemo(() => {
    if (isOrganizer || !userEntry || !tournament || !tournament.allowPlayerSetScore) {
      return []
    }

    // Matches the player can currently load a result for: their own matchups that
    // are editable (the current frontier plus any just-closed round still in its
    // derived grace window).
    const matchesByCategory = new Map<number, MatchDto[]>()

    for (const match of matches) {
      if (!matchesByCategory.has(match.tournamentCategoryId)) {
        matchesByCategory.set(match.tournamentCategoryId, [])
      }

      matchesByCategory.get(match.tournamentCategoryId)!.push(match)
    }

    return matches.filter(
      (match) =>
        match.awayCompetitorIds !== null &&
        (match.homeCompetitorIds.includes(userEntry.id) || match.awayCompetitorIds.includes(userEntry.id)) &&
        isMatchEditable(
          match,
          matchesByCategory.get(match.tournamentCategoryId) ?? [],
          tournament.type,
          tournament.status
        )
    )
  }, [isOrganizer, matches, userEntry, tournament])
  // Interclubes derives its structure from the number of registered teams, so
  // the notice also spells out what that number produces right now. With
  // several categories each one has its own count, so the sentence is skipped.
  const formatNotice = useMemo(() => {
    if (tournament?.type !== TournamentType.INTERCLUBS || categories.length !== 1) {
      return null
    }

    return describeInterclubsFormat(competitors.length)
  }, [tournament?.type, categories.length, competitors.length])
  const loadTournament = useCallback(async () => {
    const data = await getTournament(tournamentId)

    setTournament(data)
    setLoading(false)
  }, [getTournament, tournamentId])

  useEffect(() => {
    loadTournament()
  }, [loadTournament])

  // Check the organizer's Mercado Pago connection so we can warn them if a paid
  // tournament has no account to collect into.
  useEffect(() => {
    if (!isOrganizer || !tournament?.paid) {
      return
    }

    getStatus()
      .then((status) => setMpConnected(status.connected))
      .catch(() => setMpConnected(null))
  }, [getStatus, isOrganizer, tournament?.paid])

  // Handle the return from Mercado Pago checkout (?payment=success|failure|pending):
  // notify the player and, on success, poll the payment status until the
  // registration is confirmed by the webhook, then refresh the tournament.
  useEffect(() => {
    if (isOrganizer) {
      return
    }

    const result = searchParams.get('payment')

    if (!result || paymentHandled.current) {
      return
    }

    paymentHandled.current = true
    router.replace(`/tournaments/${tournamentId}`)

    if (result === 'failure') {
      showErrorMessage('El pago no se completó. No se realizó la inscripción')

      return
    }

    if (result === 'pending') {
      showWarningMessage('Tu pago está pendiente de acreditación. Te inscribiremos cuando se confirme')

      return
    }

    if (result !== 'success') {
      return
    }

    showSuccessMessage('Pago recibido. Confirmando tu inscripción...')

    let attempts = 0

    const poll = async () => {
      attempts += 1

      const status = await getPaymentStatus(tournamentId)

      if (status?.status === PaymentStatus.APPROVED) {
        showSuccessMessage('¡Inscripción confirmada!')
        await loadTournament()

        return
      }

      if (status?.status === PaymentStatus.REFUNDED) {
        showErrorMessage('Tu pago fue reembolsado porque no se pudo completar la inscripción')

        return
      }

      if (attempts < 6) {
        setTimeout(poll, 2500)
      } else {
        showWarningMessage('Estamos confirmando tu pago. La inscripción aparecerá en unos instantes')
      }
    }

    poll()
  }, [
    isOrganizer,
    searchParams,
    router,
    tournamentId,
    getPaymentStatus,
    loadTournament,
    showSuccessMessage,
    showWarningMessage,
    showErrorMessage
  ])

  // Handle arrival from an invite link (/tournaments/[id]/join redirects here
  // with ?join=1): auto-open the join dialog once the tournament has loaded,
  // then strip the param so a refresh doesn't reopen it.
  useEffect(() => {
    if (isOrganizer || joinLinkHandled.current || loading || !tournament) {
      return
    }

    if (searchParams.get('join') !== '1') {
      return
    }

    joinLinkHandled.current = true
    router.replace(`/tournaments/${tournamentId}`)

    if (!userEntry && tournament.status === TournamentStatus.STAND_BY) {
      setJoinOpen(true)
    }
  }, [isOrganizer, searchParams, router, tournamentId, loading, tournament, userEntry])

  if (loading) {
    return (
      <div className="tournament-view">
        <Paper className="header">
          <div className="header-body">
            <Skeleton
              variant="rounded"
              className="poster"
              width={160}
              height={200}
              sx={{ borderRadius: 'var(--radius-md, 8px)', flexShrink: 0 }}
            />
            <div className="header-content">
              <div className="title-row">
                <Skeleton variant="text" width="50%" height={36} />
                <Skeleton variant="rounded" width={80} height={26} className="skeleton-chip" />
              </div>
              <Skeleton variant="text" width="70%" height={20} />
              <div className="meta">
                <Skeleton variant="rounded" width={90} height={24} className="skeleton-meta-item" />
                <Skeleton variant="rounded" width={70} height={24} className="skeleton-meta-item" />
                <Skeleton variant="rounded" width={80} height={24} className="skeleton-meta-item" />
                <Skeleton variant="text" width={120} height={20} />
              </div>
              <div className="footer">
                <Skeleton variant="rounded" width={140} height={36} />
                {isOrganizer && <Skeleton variant="rounded" width={140} height={36} />}
              </div>
            </div>
          </div>
        </Paper>

        {[0, 1].map((key) => (
          <Paper key={key} className="category-accordion">
            <div className="category-accordion-summary" style={{ display: 'flex', alignItems: 'center' }}>
              <div className="category-header">
                <Skeleton variant="text" width={160} height={28} />
                <Skeleton variant="rounded" width={70} height={24} className="skeleton-chip" />
              </div>
            </div>
            <Divider />
            <div className="category-details">
              <div className="category-section">
                <Skeleton variant="text" width={180} height={24} />
                <Skeleton variant="rounded" height={48} />
                <Skeleton variant="rounded" height={48} />
              </div>
            </div>
          </Paper>
        ))}
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">Torneo no encontrado</Alert>
  }

  // The single category (categoryId = null) renders the flat layout; real
  // categories render one accordion each.
  const categoryGroups = categoryKeys.map((key) => {
    const groupCompetitors = competitors.filter((competitor) => competitor.tournamentCategoryId === key)
    const hasMatches = matches.some((match) => match.tournamentCategoryId === key)

    return { key, groupCompetitors, hasMatches }
  })

  const runAction = async (action: () => Promise<void>) => {
    setWorking(true)

    try {
      await action()
    } catch (requestError) {
      setWorking(false)

      return false
    }

    await loadTournament()
    setWorking(false)

    return true
  }

  const handleStart = () => {
    setConfirmStartOpen(true)
  }

  const handleConfirmStart = () => {
    setConfirmStartOpen(false)
    runAction(() => startTournament(tournament.id))
  }

  const handleFinish = () => {
    setConfirmFinishOpen(true)
  }

  const handleConfirmFinish = () => {
    setConfirmFinishOpen(false)
    runAction(() => finishTournament(tournament.id))
  }

  const handleShare = async () => {
    const url = `${appUrl}/tournaments/${tournament.id}/join`
    const message = `¡Te invito a inscribirte en el torneo "${tournament.name}"! Entrá desde acá: ${url}`

    // wa.me only supports pre-filled text, it can't attach a picture. When the
    // tournament has a poster and the browser supports the Web Share API with
    // files (mobile browsers), share text + image through the native share
    // sheet so the user can pick WhatsApp and send both together. Otherwise
    // fall back to the plain text link.
    if (tournament.image && typeof navigator !== 'undefined' && navigator.share) {
      const file = dataUrlToFile(tournament.image.image, `torneo-${tournament.id}.jpg`)

      if (file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ text: message, files: [file] })

          return
        } catch (shareError) {
          // User cancelled the share sheet, or the browser rejected it — fall
          // through to the wa.me link below instead of leaving them stuck.
        }
      }
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleLeave = () => {
    setConfirmLeaveOpen(true)
  }

  const handleConfirmLeave = async () => {
    setConfirmLeaveOpen(false)
    await runAction(() => leaveTournament(tournament.id))
  }

  const handleSaveScore = async (score: MatchScore) => {
    if (!scoreMatch) {
      return
    }

    const saved = await runAction(() => saveMatchResult(scoreMatch.id, score))

    if (saved) {
      setScoreMatch(null)
    }
  }

  return (
    <div className="tournament-view">
      <Paper className="header">
        <div className="header-body">
          {tournament.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.image.image} alt={tournament.name} className="poster" />
          )}
          <div className="header-content">
            <div className="title-row">
              {isOrganizer ? (
                <div className="name-with-edit">
                  <Typography variant="h5" component="h1" className="name">
                    {tournament.name}
                  </Typography>
                  <Tooltip title="Editar">
                    <IconButton size="small" onClick={() => setEditOpen(true)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              ) : (
                <Typography variant="h5" component="h1" className="name">
                  {tournament.name}
                </Typography>
              )}
              <div className="title-actions">
                <StatusChip tournament={tournament} />
              </div>
            </div>
            {tournament.description && (
              <Typography variant="body2" color="text.secondary">
                {tournament.description}
              </Typography>
            )}
            <div className="meta">
              <Chip size="small" label={DisciplineNames[tournament.discipline]} />
              {tournament.subDiscipline && <Chip size="small" label={SubDisciplineNames[tournament.subDiscipline]} />}
              <Chip size="small" label={TournamentTypeNames[tournament.type]} />
              <Chip size="small" label={ScoreFormatNames[tournament.scoreFormat]} />
              <Chip
                size="small"
                color={tournament.paid && tournament.entryFee ? 'success' : 'default'}
                icon={tournament.paid && tournament.entryFee ? <PaidIcon /> : undefined}
                label={
                  tournament.paid && tournament.entryFee
                    ? formatMoney(tournament.entryFee, tournament.currency)
                    : 'Gratuito'
                }
              />
              {tournament.site?.name && (
                <span className="meta-item">
                  <PlaceIcon fontSize="inherit" /> {tournament.site.name}
                </span>
              )}
              <span className="meta-item">
                <CalendarMonthIcon fontSize="inherit" /> {tournament.startDate}
                {tournament.startTime ? ` · ${tournament.startTime}` : ''}
              </span>
            </div>
            {isOrganizer && tournament.paid && mpConnected === false && (
              <Alert severity="warning" className="mp-warning">
                Este torneo tiene inscripción de pago, pero todavía no vinculaste tu cuenta de Mercado Pago. Los
                jugadores no podrán inscribirse hasta que la conectes desde <strong>Mi cuenta</strong>.
              </Alert>
            )}
            {isOrganizer ? (
              <div className="footer">
                <div className="info-area">
                  {tournament.status === TournamentStatus.STAND_BY && (
                    <Button
                      variant="outlined"
                      startIcon={<SettingsIcon />}
                      component={Link}
                      href={`/tournaments/${tournament.id}/admin`}
                    >
                      Administrar
                    </Button>
                  )}
                  {tournament.status === TournamentStatus.STAND_BY && (
                    <Button variant="outlined" color="success" startIcon={<WhatsAppIcon />} onClick={handleShare}>
                      Compartir
                    </Button>
                  )}
                  {tournament.status === TournamentStatus.ONGOING && (
                    <Button
                      variant="outlined"
                      className="planner-button"
                      startIcon={<EventNoteIcon />}
                      component={Link}
                      href={`/tournaments/${tournament.id}/planner`}
                    >
                      Planificador
                    </Button>
                  )}
                </div>
                <div className="actions-area">
                  {tournament.status === TournamentStatus.STAND_BY && (
                    <Button
                      variant="contained"
                      startIcon={<PlayArrowIcon />}
                      onClick={handleStart}
                      disabled={working || competitors.length < 2}
                      loading={working}
                    >
                      Iniciar torneo
                    </Button>
                  )}
                  {tournament.status === TournamentStatus.ONGOING && (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={handleFinish}
                      disabled={working}
                      loading={working}
                    >
                      Finalizar torneo
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              tournament.status === TournamentStatus.STAND_BY && (
                <div className="footer">
                  <div className="info-area">
                    {userEntry ? (
                      <Chip icon={<CheckCircleIcon />} color="success" label="Inscripto" />
                    ) : !registrationOpen ? (
                      <Chip
                        color="info"
                        label={`Las inscripciones abren el ${dayjs(tournament.startInscriptionsDate).format('DD/MM/YYYY')}`}
                      />
                    ) : (
                      <></>
                    )}
                  </div>
                  <div className="actions-area">
                    {userEntry ? (
                      <Button
                        color="error"
                        variant="outlined"
                        onClick={handleLeave}
                        disabled={working}
                        loading={working}
                      >
                        Darme de baja
                      </Button>
                    ) : registrationOpen ? (
                      <Button variant="contained" startIcon={<HowToRegIcon />} onClick={() => setJoinOpen(true)}>
                        Inscribirme
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </Paper>

      {tournament.type === TournamentType.INTERCLUBS && (
        <Alert severity="info" className="interclubs-notice">
          <strong>Cómo se arma el torneo.</strong> El formato depende de cuántos equipos se inscriban: hasta 4 equipos
          se juega una zona única de todos contra todos, ida y vuelta. Con más de 4 se arman zonas de 4 equipos y los
          que sobran se reparten entre esas zonas (por ejemplo, 11 equipos son 2 zonas, de 6 y 5). De cada zona
          clasifican los 2 primeros a la eliminatoria; si queda una zona única, clasifican los 4 primeros.
          <br />
          Cada encuentro se juega a 3 partidos (dependiendo de la categoría se juega un dobles y dos singles, o dos
          dobles y un single) y ningún jugador puede disputar más de uno. La localía se alterna: si dos clubes ya se
          enfrentaron, se invierte, y si no, es local el que menos veces lo fue.
          {formatNotice && (
            <>
              <br />
              <strong>{formatNotice}</strong>
            </>
          )}
        </Alert>
      )}

      {myMatches.length > 0 && (
        <Paper className="section my-match">
          <Typography variant="h6" className="section-title">
            Tu partido
          </Typography>
          {myMatches.map((match) => (
            <div key={match.id} className="my-match-row">
              <MatchCard match={match} tournament={tournament} highlighted />
              <Button variant="contained" size="small" onClick={() => setScoreMatch(match)}>
                {match.status === MatchStatus.PENDING ? 'Cargar resultado' : 'Editar resultado'}
              </Button>
            </div>
          ))}
        </Paper>
      )}

      {categoryGroups.map(({ key, groupCompetitors, hasMatches }) => {
        // Organizers always see categories expanded. Players get them
        // collapsed by default, except while inscriptions are open or when
        // they're registered and playing in this specific category.
        const isPlayingCategory = !isOrganizer && userEntry?.tournamentCategoryId === key
        const categoryDefaultExpanded =
          isOrganizer || tournament.status === TournamentStatus.STAND_BY || isPlayingCategory
        const showCompetitorCount = isOrganizer || tournament.status === TournamentStatus.STAND_BY

        return (
          <Accordion
            key={key}
            defaultExpanded={categoryDefaultExpanded}
            disableGutters
            elevation={2}
            className="category-accordion"
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} className="category-accordion-summary">
              <div className="category-header">
                <Typography variant="h6" className="category-title">
                  {categoryNameById.get(key) ?? 'Categoría única'}
                </Typography>
                {showCompetitorCount && (
                  <Chip
                    size="small"
                    label={`${groupCompetitors.length} / ${maxByCategory.get(key)}`}
                    color="primary"
                    variant="outlined"
                  />
                )}
              </div>
            </AccordionSummary>
            <Divider />
            <AccordionDetails className="category-details">
              <div className="category-section">
                <Typography variant="subtitle1" className={isOrganizer ? 'category-subtitle' : 'section-title'}>
                  Competidores inscriptos
                </Typography>
                <CompetitorsList tournament={tournament} category={key} />
              </div>
              {hasMatches && (
                <>
                  <Divider />
                  <TournamentRoundsView
                    tournament={tournament}
                    category={key}
                    organizerMode={isOrganizer}
                    onEditMatch={setScoreMatch}
                  />
                </>
              )}
            </AccordionDetails>
          </Accordion>
        )
      })}

      {isOrganizer && (
        <EditTournamentDialog
          open={editOpen}
          tournament={tournament}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            loadTournament()
          }}
        />
      )}

      <ScoreDialog
        open={!!scoreMatch}
        tournament={tournament}
        match={scoreMatch!}
        saving={working}
        onClose={() => setScoreMatch(null)}
        onSave={handleSaveScore}
      />

      {isOrganizer ? (
        <>
          <Dialog open={confirmStartOpen} onClose={() => setConfirmStartOpen(false)}>
            <DialogTitle>Iniciar torneo</DialogTitle>
            <DialogContent>
              <DialogContentText>¿Iniciár el torneo con {competitors.length} competidores?</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmStartOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={handleConfirmStart}>
                Iniciar
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={confirmFinishOpen} onClose={() => setConfirmFinishOpen(false)}>
            <DialogTitle>Finalizar torneo</DialogTitle>
            <DialogContent>
              <DialogContentText>
                ¿Estás seguro que querés finalizar el torneo? Esta acción no se puede deshacer.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmFinishOpen(false)}>Cancelar</Button>
              <Button color="error" variant="contained" onClick={handleConfirmFinish}>
                Finalizar
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : (
        <>
          <JoinTournamentDialog
            open={joinOpen}
            tournament={tournament}
            onClose={() => setJoinOpen(false)}
            onSuccess={async () => {
              setJoinOpen(false)
              await loadTournament()
            }}
          />

          <Dialog open={confirmLeaveOpen} onClose={() => setConfirmLeaveOpen(false)}>
            <DialogTitle>Darse de baja</DialogTitle>
            <DialogContent>
              <DialogContentText>
                ¿Estás seguro que querés darte de baja del torneo? Esta acción no se puede deshacer.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmLeaveOpen(false)}>Cancelar</Button>
              <Button color="error" variant="contained" onClick={handleConfirmLeave}>
                Darme de baja
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </div>
  )
}
