'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import PaidIcon from '@mui/icons-material/Paid'
import PlaceIcon from '@mui/icons-material/Place'
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
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CompetitorsList from '@/app/(protected)/(tournaments)/components/CompetitorsList'
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
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { formatMoney } from '@/app/(protected)/(tournaments)/utils/money'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useUserStore } from '@/app/stores/users'
import { SubDisciplineNames } from '../../models/SubDiscipline'

interface PlayerTournamentViewProps {
  tournamentId: number
}

export default function PlayerTournamentView({ tournamentId }: PlayerTournamentViewProps) {
  const { getTournament, leaveTournament, saveMatchResult, getPaymentStatus } = useTournaments()
  const { showSuccessMessage, showWarningMessage, showErrorMessage } = useNotifications()
  const router = useRouter()
  const searchParams = useSearchParams()
  const paymentHandled = useRef(false)
  const joinLinkHandled = useRef(false)
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [joinOpen, setJoinOpen] = useState(false)
  const [scoreMatch, setScoreMatch] = useState<MatchDto | null>(null)
  const [working, setWorking] = useState(false)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  const userId = useUserStore((state) => state.user?.id ?? null)
  const competitors = useMemo(() => tournament?.competitors ?? [], [tournament])
  const rounds = useMemo(() => tournament?.rounds ?? [], [tournament])
  const matches = useMemo(() => tournament?.matches ?? [], [tournament])
  const userEntry = useMemo(
    () => competitors.find((c) => c.userId === userId || c.partnerUserId === userId) ?? null,
    [competitors, userId]
  )
  const openCurrentRoundIds = useMemo(
    // Active rounds are editable: the current frontier plus any just-closed
    // round still in its grace window.
    () => new Set(rounds.filter((round) => round.active).map((round) => round.id)),
    [rounds]
  )
  const myMatches = useMemo(() => {
    if (!userEntry) {
      return []
    }

    return matches.filter(
      (match) =>
        openCurrentRoundIds.has(match.roundId) &&
        match.awayCompetitorIds !== null &&
        (match.homeCompetitorIds.includes(userEntry.id) || match.awayCompetitorIds.includes(userEntry.id))
    )
  }, [matches, userEntry, openCurrentRoundIds])
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
  const loadTournament = useCallback(async () => {
    const data = await getTournament(tournamentId)

    setTournament(data)
    setLoading(false)
  }, [getTournament, tournamentId])

  useEffect(() => {
    loadTournament()
  }, [loadTournament])

  // Handle the return from Mercado Pago checkout (?payment=success|failure|pending):
  // notify the player and, on success, poll the payment status until the
  // registration is confirmed by the webhook, then refresh the tournament.
  useEffect(() => {
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
    if (joinLinkHandled.current || loading || !tournament) {
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
  }, [searchParams, router, tournamentId, loading, tournament, userEntry])

  if (loading) {
    return (
      <div className="player-tournament">
        <Paper className="header">
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
        </Paper>
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">Torneo no encontrado</Alert>
  }

  const categoryGroups = categoryKeys.map((key) => {
    const groupCompetitors = competitors.filter((competitor) => competitor.tournamentCategoryId === key)
    const groupRounds = rounds.filter((round) => round.tournamentCategoryId === key)

    return { key, groupCompetitors, groupRounds }
  })

  const handleLeave = () => {
    setConfirmLeaveOpen(true)
  }

  const handleConfirmLeave = async () => {
    setConfirmLeaveOpen(false)
    setWorking(true)

    try {
      await leaveTournament(tournament.id)
    } catch (requestError) {
      setWorking(false)

      return
    }

    await loadTournament()
    setWorking(false)
  }

  const handleSaveScore = async (score: MatchScore) => {
    if (!scoreMatch) {
      return
    }

    setWorking(true)

    try {
      await saveMatchResult(scoreMatch.id, score)
    } catch (requestError) {
      setWorking(false)

      return
    }

    setScoreMatch(null)
    await loadTournament()
    setWorking(false)
  }

  return (
    <div className="player-tournament">
      <Paper className="header">
        <div className="title-row">
          <Typography variant="h5" component="h1" className="name">
            {tournament.name}
          </Typography>
          <StatusChip status={tournament.status} />
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
          <span className="meta-item">
            <CalendarMonthIcon fontSize="inherit" /> {tournament.startDate}
            {tournament.startTime ? ` · ${tournament.startTime}` : ''}
          </span>
          {tournament.location && (
            <span className="meta-item">
              <PlaceIcon fontSize="inherit" /> {tournament.location}
            </span>
          )}
        </div>
        {tournament.status === TournamentStatus.STAND_BY && (
          <div className="footer">
            <div className="info-area">
              {userEntry ? <Chip icon={<CheckCircleIcon />} color="success" label="Inscripto" /> : <></>}
            </div>
            <div className="actions-area">
              {userEntry ? (
                <Button color="error" variant="outlined" onClick={handleLeave} disabled={working} loading={working}>
                  Darme de baja
                </Button>
              ) : (
                <Button variant="contained" startIcon={<HowToRegIcon />} onClick={() => setJoinOpen(true)}>
                  Inscribirme
                </Button>
              )}
            </div>
          </div>
        )}
      </Paper>

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

      {categoryGroups.map(({ key, groupCompetitors, groupRounds }) => {
        // Collapsed by default, except while inscriptions are open or when the
        // player is registered and playing in this specific category.
        const isPlayingCategory = userEntry?.tournamentCategoryId === key
        const categoryDefaultExpanded = tournament.status === TournamentStatus.STAND_BY || isPlayingCategory

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
                {tournament.status == TournamentStatus.STAND_BY && (
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
                <Typography variant="subtitle1" className="section-title">
                  Competidores inscriptos
                </Typography>
                <CompetitorsList tournament={tournament} category={key} />
              </div>

              {groupRounds.length > 0 && (
                <>
                  <Divider />
                  <TournamentRoundsView tournament={tournament} category={key} onEditMatch={setScoreMatch} />
                </>
              )}
            </AccordionDetails>
          </Accordion>
        )
      })}

      <ScoreDialog
        open={!!scoreMatch}
        tournament={tournament}
        match={scoreMatch!}
        saving={working}
        onClose={() => setScoreMatch(null)}
        onSave={handleSaveScore}
      />

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
    </div>
  )
}
