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
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import CompetitorsList from '@/app/(protected)/(tournaments)/components/CompetitorsList'
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
import { SubDisciplineNames } from '../../models/SubDiscipline'

interface PlayerTournamentViewProps {
  tournamentId: number
}

export default function PlayerTournamentView({ tournamentId }: PlayerTournamentViewProps) {
  const { getTournament, leaveTournament, saveMatchResult } = useTournaments()
  const t = useTranslations('tournaments')
  const tPlayer = useTranslations('player')
  const tOrganizer = useTranslations('organizer')
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoreMatch, setScoreMatch] = useState<MatchDto | null>(null)
  const [working, setWorking] = useState(false)
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
    return <Alert severity="error">{tPlayer('errors.notFound')}</Alert>
  }

  const categoryGroups = categoryKeys.map((key) => {
    const groupCompetitors = competitors.filter((competitor) => competitor.tournamentCategoryId === key)
    const groupRounds = rounds.filter((round) => round.tournamentCategoryId === key)

    return { key, groupCompetitors, groupRounds }
  })

  const handleLeave = async () => {
    if (!window.confirm(tPlayer('leaveConfirm'))) {
      return
    }

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
          <Chip size="small" label={t(`discipline.${DisciplineNames[tournament.discipline]}`)} />
          {tournament.subDiscipline && (
            <Chip size="small" label={t(`subDiscipline.${SubDisciplineNames[tournament.subDiscipline]}`)} />
          )}
          <Chip size="small" label={t(`type.${TournamentTypeNames[tournament.type]}`)} />
          <Chip size="small" label={t(`scoreFormat.${ScoreFormatNames[tournament.scoreFormat]}`)} />
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
              {userEntry ? <Chip icon={<CheckCircleIcon />} color="success" label={tPlayer('registered')} /> : <></>}
            </div>
            <div className="actions-area">
              {userEntry ? (
                <Button color="error" variant="outlined" onClick={handleLeave} disabled={working}>
                  {tPlayer('leave')}
                </Button>
              ) : (
                <Button
                  component={Link}
                  href={`/tournaments/${tournament.id}/join`}
                  variant="contained"
                  startIcon={<HowToRegIcon />}
                >
                  {tPlayer('join')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Paper>

      {myMatches.length > 0 && (
        <Paper className="section my-match">
          <Typography variant="h6" className="section-title">
            {tPlayer('yourMatch')}
          </Typography>
          {myMatches.map((match) => (
            <div key={match.id} className="my-match-row">
              <MatchCard match={match} tournament={tournament} highlighted />
              <Button variant="contained" size="small" onClick={() => setScoreMatch(match)}>
                {match.status === MatchStatus.PENDING ? tPlayer('loadResult') : tPlayer('editResult')}
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
                {categoryNameById.get(key) ?? t('uniqueCategory')}
              </Typography>
              <Chip
                size="small"
                label={`${groupCompetitors.length} / ${maxByCategory.get(key)}`}
                color="primary"
                variant="outlined"
              />
            </div>
          </AccordionSummary>
          <Divider />
          <AccordionDetails className="category-details">
            <div className="category-section">
              <Typography variant="subtitle1" className="section-title">
                {tOrganizer('manage.registeredCompetitors')}
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
    </div>
  )
}
