'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import PlaceIcon from '@mui/icons-material/Place'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { leaveTournament } from '@/app/(tournaments)/actions/registration'
import { getTournamentDetail, saveMatchResult, TournamentDetailWithEntry } from '@/app/(tournaments)/actions/tournament'
import BracketView from '@/app/(tournaments)/components/BracketView'
import FixtureView from '@/app/(tournaments)/components/FixtureView'
import MatchCard from '@/app/(tournaments)/components/MatchCard'
import ScoreDialog from '@/app/(tournaments)/components/ScoreDialog'
import StandingsTable from '@/app/(tournaments)/components/StandingsTable'
import StatusChip from '@/app/(tournaments)/components/StatusChip'
import { Match } from '@/app/(tournaments)/models/Match'
import { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'
import {
  DISCIPLINE_KEYS,
  SCORE_FORMAT_KEYS,
  SUB_DISCIPLINE_KEYS,
  TOURNAMENT_TYPE_KEYS
} from '@/app/(tournaments)/utils/labels'
import { computeStandings } from '@/app/(tournaments)/utils/standings'
import { useNotificationsStore } from '@/app/stores/notifications.store'

interface PlayerTournamentViewProps {
  tournamentId: number
}

export default function PlayerTournamentView({ tournamentId }: PlayerTournamentViewProps) {
  const t = useTranslations('tournaments')
  const tPlayer = useTranslations('player')
  const [detail, setDetail] = useState<TournamentDetailWithEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoreMatch, setScoreMatch] = useState<Match | null>(null)
  const [working, setWorking] = useState(false)
  const notify = useNotificationsStore((state) => state.notify)
  const loadDetail = useCallback(async () => {
    const data = await getTournamentDetail(tournamentId)

    setDetail(data)
    setLoading(false)
  }, [tournamentId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const tournament = detail?.tournament ?? null
  const competitors = useMemo(() => detail?.competitors ?? [], [detail])
  const rounds = detail?.rounds ?? []
  const matches = useMemo(() => detail?.matches ?? [], [detail])
  const userEntry = detail?.userEntry ?? null
  const competitorNames = useMemo(() => {
    const names: Record<number, string> = {}

    for (const competitor of competitors) {
      names[competitor.id] = competitor.displayName
    }

    return names
  }, [competitors])
  const currentRound = tournament ? rounds.find((round) => round.number === tournament.currentRound) ?? null : null
  const roundIsOpen = currentRound?.status === RoundStatus.OPEN
  const myMatches = useMemo(() => {
    if (!userEntry || !currentRound || !roundIsOpen) {
      return []
    }

    return matches.filter(
      (match) =>
        match.roundId === currentRound.id &&
        match.awayCompetitorIds !== null &&
        (match.homeCompetitorIds.includes(userEntry.id) || match.awayCompetitorIds.includes(userEntry.id))
    )
  }, [matches, userEntry, currentRound, roundIsOpen])
  const editableMatchIds = myMatches.map((match) => match.id)
  const standings = useMemo(
    () =>
      tournament && tournament.type !== TournamentType.PLAYOFF
        ? computeStandings(tournament.type, tournament.scoreFormat, tournament.settings ?? {}, competitors, matches)
        : [],
    [tournament, competitors, matches]
  )

  if (loading) {
    return (
      <div className="player-tournament" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <CircularProgress />
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">{tPlayer('errors.notFound')}</Alert>
  }

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
          <Chip size="small" label={t(`discipline.${DISCIPLINE_KEYS[tournament.discipline]}`)} />
          {tournament.subDiscipline && (
            <Chip size="small" label={t(`subDiscipline.${SUB_DISCIPLINE_KEYS[tournament.subDiscipline]}`)} />
          )}
          <Chip size="small" label={t(`type.${TOURNAMENT_TYPE_KEYS[tournament.type]}`)} />
          <Chip size="small" label={t(`scoreFormat.${SCORE_FORMAT_KEYS[tournament.scoreFormat]}`)} />
          <span className="meta-item">
            <CalendarMonthIcon fontSize="inherit" /> {tournament.startDate}
          </span>
          {tournament.location && (
            <span className="meta-item">
              <PlaceIcon fontSize="inherit" /> {tournament.location}
            </span>
          )}
        </div>
        {tournament.status === TournamentStatus.STAND_BY && (
          <div className="actions">
            {userEntry ? (
              <>
                <Chip icon={<CheckCircleIcon />} color="success" label={tPlayer('registered')} />
                <Button color="error" variant="outlined" onClick={handleLeave} disabled={working}>
                  {tPlayer('leave')}
                </Button>
              </>
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
        )}
      </Paper>

      {myMatches.length > 0 && (
        <Paper className="section my-match">
          <Typography variant="h6" className="section-title">
            {tPlayer('yourMatch')}
          </Typography>
          {myMatches.map((match) => (
            <div key={match.id} className="my-match-row">
              <MatchCard
                match={match}
                competitorNames={competitorNames}
                scoreFormat={tournament.scoreFormat}
                highlighted
              />
              <Button variant="contained" size="small" onClick={() => setScoreMatch(match)}>
                {match.status === MatchStatus.PENDING ? tPlayer('loadResult') : tPlayer('editResult')}
              </Button>
            </div>
          ))}
        </Paper>
      )}

      {rounds.length > 0 && (
        <Paper className="section">
          <Typography variant="h6" className="section-title">
            {tournament.type === TournamentType.PLAYOFF ? t('bracket') : t('fixture')}
          </Typography>
          {tournament.type === TournamentType.PLAYOFF ? (
            <BracketView
              rounds={rounds}
              matches={matches}
              competitorNames={competitorNames}
              scoreFormat={tournament.scoreFormat}
              highlightedMatchIds={editableMatchIds}
              editableMatchIds={editableMatchIds}
              onEditMatch={setScoreMatch}
            />
          ) : (
            <FixtureView
              type={tournament.type}
              rounds={rounds}
              matches={matches}
              competitorNames={competitorNames}
              scoreFormat={tournament.scoreFormat}
              highlightedMatchIds={editableMatchIds}
              editableMatchIds={editableMatchIds}
              onEditMatch={setScoreMatch}
            />
          )}
        </Paper>
      )}

      {standings.length > 0 && rounds.length > 0 && (
        <Paper className="section">
          <Typography variant="h6" className="section-title">
            {t('standings')}
          </Typography>
          <StandingsTable type={tournament.type} rows={standings} />
        </Paper>
      )}

      <ScoreDialog
        open={!!scoreMatch}
        scoreFormat={tournament.scoreFormat}
        homeName={scoreMatch ? scoreMatch.homeCompetitorIds.map((id) => competitorNames[id] ?? '').join(' / ') : ''}
        awayName={
          scoreMatch ? (scoreMatch.awayCompetitorIds ?? []).map((id) => competitorNames[id] ?? '').join(' / ') : ''
        }
        initialScore={scoreMatch?.score ?? null}
        saving={working}
        onClose={() => setScoreMatch(null)}
        onSave={handleSaveScore}
      />
    </div>
  )
}
