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
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import { getTournament, leaveTournament, saveMatchResult } from '@/app/(protected)/(tournaments)/actions/tournament'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import ScoreDialog from '@/app/(protected)/(tournaments)/components/ScoreDialog'
import StatusChip from '@/app/(protected)/(tournaments)/components/StatusChip'
import TournamentRoundsView from '@/app/(protected)/(tournaments)/components/TournamentRoundsView'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { ScoreFormatNames } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { useNotificationsStore } from '@/app/stores/notifications.store'
import { SubDisciplineNames } from '../../models/SubDiscipline'

interface PlayerTournamentViewProps {
  tournamentId: number
}

export default function PlayerTournamentView({ tournamentId }: PlayerTournamentViewProps) {
  const t = useTranslations('tournaments')
  const tPlayer = useTranslations('player')
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoreMatch, setScoreMatch] = useState<MatchDto | null>(null)
  const [working, setWorking] = useState(false)
  const notify = useNotificationsStore((state) => state.notify)
  const userId = useUserStore((state) => state.user?.id ?? null)
  const loadDetail = useCallback(async () => {
    const data = await getTournament(tournamentId)

    setTournament(data)
    setLoading(false)
  }, [tournamentId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const competitors = useMemo(() => tournament?.competitors ?? [], [tournament])
  const rounds = useMemo(() => tournament?.rounds ?? [], [tournament])
  const matches = useMemo(() => tournament?.matches ?? [], [tournament])
  const userEntry = useMemo(
    () => competitors.find((c) => c.userId === userId || c.partnerUserId === userId) ?? null,
    [competitors, userId]
  )
  const currentRoundNumber = tournament?.currentRound ?? 0
  const openCurrentRoundIds = useMemo(
    () =>
      new Set(
        rounds
          .filter((round) => round.number === currentRoundNumber && round.status === RoundStatus.OPEN)
          .map((round) => round.id)
      ),
    [rounds, currentRoundNumber]
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
  const categoryKeys = useMemo<(string | null)[]>(
    () => (tournament?.categories && tournament.categories.length > 0 ? tournament.categories : [null]),
    [tournament]
  )

  if (loading) {
    return (
      <div className="player-tournament">
        <Paper className="header">
          <div className="title-row">
            <Skeleton variant="text" width="50%" height={36} />
            <Skeleton variant="rounded" width={80} height={26} sx={{ borderRadius: 12 }} />
          </div>
          <Skeleton variant="text" width="70%" height={20} />
          <div className="meta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Skeleton variant="rounded" width={90} height={24} sx={{ borderRadius: 8 }} />
            <Skeleton variant="rounded" width={70} height={24} sx={{ borderRadius: 8 }} />
            <Skeleton variant="rounded" width={80} height={24} sx={{ borderRadius: 8 }} />
            <Skeleton variant="text" width={120} height={20} />
          </div>
        </Paper>
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">{tPlayer('errors.notFound')}</Alert>
  }

  const hasCategories = categoryKeys.some((key) => key !== null)
  const categoryGroups = categoryKeys.map((key) => {
    const groupRounds = rounds.filter((round) => (round.category ?? null) === key)

    return { key, groupRounds }
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
      notify(tPlayer(`errors.${(requestError as Error).message}`))

      return
    }

    await loadDetail()
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
      notify(tPlayer(`errors.${(requestError as Error).message}`))

      return
    }

    setScoreMatch(null)
    await loadDetail()
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

      {hasCategories
        ? categoryGroups.map(({ key, groupRounds }) => (
            <Accordion
              key={key ?? '__all__'}
              defaultExpanded
              disableGutters
              elevation={2}
              sx={{ borderRadius: '12px !important', overflow: 'hidden', '&:before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2.5, minHeight: 56 }}>
                <Typography variant="h6" fontWeight={700}>
                  {key}
                </Typography>
              </AccordionSummary>
              <Divider />
              <AccordionDetails sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {groupRounds.length > 0 && (
                  <TournamentRoundsView
                    tournament={tournament}
                    category={key ?? undefined}
                    onEditMatch={setScoreMatch}
                  />
                )}
              </AccordionDetails>
            </Accordion>
          ))
        : categoryGroups.map(({ key, groupRounds }) => (
            <Fragment key={key ?? '__all__'}>
              {groupRounds.length > 0 && (
                <Paper className="section">
                  <TournamentRoundsView tournament={tournament} onEditMatch={setScoreMatch} />
                </Paper>
              )}
            </Fragment>
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
