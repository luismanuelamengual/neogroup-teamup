'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HowToRegIcon from '@mui/icons-material/HowToReg'
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
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ScoreFormatNames } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { useUserStore } from '@/app/stores/users'
import { SubDisciplineNames } from '../../models/SubDiscipline'
import {
  DISCIPLINE_LABELS,
  PLAYER_ERROR_MESSAGES,
  SCORE_FORMAT_LABELS,
  SUB_DISCIPLINE_LABELS,
  TOURNAMENT_TYPE_LABELS
} from '../../utils/labels'

interface PlayerTournamentViewProps {
  tournamentId: number
}

export default function PlayerTournamentView({ tournamentId }: PlayerTournamentViewProps) {
  const { getTournament, leaveTournament, saveMatchResult } = useTournaments()
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
    return <Alert severity="error">{PLAYER_ERROR_MESSAGES['notFound'] ?? 'Torneo no encontrado'}</Alert>
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
          <Chip
            size="small"
            label={DISCIPLINE_LABELS[DisciplineNames[tournament.discipline]] ?? tournament.discipline}
          />
          {tournament.subDiscipline && (
            <Chip
              size="small"
              label={SUB_DISCIPLINE_LABELS[SubDisciplineNames[tournament.subDiscipline]] ?? tournament.subDiscipline}
            />
          )}
          <Chip size="small" label={TOURNAMENT_TYPE_LABELS[TournamentTypeNames[tournament.type]] ?? tournament.type} />
          <Chip
            size="small"
            label={SCORE_FORMAT_LABELS[ScoreFormatNames[tournament.scoreFormat]] ?? tournament.scoreFormat}
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

      {categoryGroups.map(({ key, groupCompetitors, groupRounds }) => (
        <Accordion key={key} defaultExpanded disableGutters elevation={2} className="category-accordion">
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
      ))}

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
