'use client'

import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import PlaceIcon from '@mui/icons-material/Place'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { leaveTournament } from '@/app/_actions/registration.actions'
import { saveMatchResult } from '@/app/_actions/tournament.actions'
import BracketView from '@/app/_components/tournament/BracketView'
import FixtureView from '@/app/_components/tournament/FixtureView'
import MatchCard from '@/app/_components/tournament/MatchCard'
import ScoreDialog from '@/app/_components/tournament/ScoreDialog'
import StandingsTable from '@/app/_components/tournament/StandingsTable'
import StatusChip from '@/app/_components/tournament/StatusChip'
import { CompetitorDto, MatchDto, RoundDto, TournamentDto } from '@/app/_models/dtos'
import { MatchScore } from '@/app/_models/types'
import { useNotificationsStore } from '@/app/_stores/notifications.store'
import { computeStandings } from '@/app/_utils/standings'

import './PlayerTournamentView.styles.scss'

interface PlayerTournamentViewProps {
  tournament: TournamentDto
  competitors: CompetitorDto[]
  rounds: RoundDto[]
  matches: MatchDto[]
  userEntry: CompetitorDto | null
}

export default function PlayerTournamentView({
  tournament,
  competitors,
  rounds,
  matches,
  userEntry
}: PlayerTournamentViewProps) {
  const t = useTranslations('tournaments')
  const tPlayer = useTranslations('player')
  const router = useRouter()
  const [scoreMatch, setScoreMatch] = useState<MatchDto | null>(null)
  const [working, setWorking] = useState(false)
  const notify = useNotificationsStore((state) => state.notify)

  const competitorNames = useMemo(() => {
    const names: Record<number, string> = {}

    for (const competitor of competitors) {
      names[competitor.id] = competitor.displayName
    }

    return names
  }, [competitors])

  const currentRound = rounds.find((round) => round.number === tournament.currentRound) ?? null
  const roundIsOpen = currentRound?.status === 'open'
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
      tournament.type !== 'playoff'
        ? computeStandings(tournament.type, tournament.scoreFormat, tournament.settings, competitors, matches)
        : [],
    [tournament, competitors, matches]
  )

  const handleLeave = async () => {
    if (!window.confirm(tPlayer('leaveConfirm'))) {
      return
    }

    setWorking(true)

    const result = await leaveTournament(tournament.id)

    setWorking(false)

    if (!result.success) {
      notify(tPlayer(`errors.${result.error ?? 'notFound'}`))

      return
    }

    router.refresh()
  }

  const handleSaveScore = async (score: MatchScore) => {
    if (!scoreMatch) {
      return
    }

    setWorking(true)

    const result = await saveMatchResult(scoreMatch.id, score)

    setWorking(false)

    if (!result.success) {
      notify(tPlayer(`errors.${result.error ?? 'notFound'}`))

      return
    }

    setScoreMatch(null)
    router.refresh()
  }

  return (
    <div className="player-tournament">
      <Paper className="player-tournament__header">
        <div className="player-tournament__title-row">
          <Typography variant="h5" component="h1" className="player-tournament__name">
            {tournament.name}
          </Typography>
          <StatusChip status={tournament.status} />
        </div>
        {tournament.description && (
          <Typography variant="body2" color="text.secondary">
            {tournament.description}
          </Typography>
        )}
        <div className="player-tournament__meta">
          <Chip size="small" label={t(`discipline.${tournament.discipline}`)} />
          <Chip size="small" label={t(`type.${tournament.type}`)} />
          <Chip size="small" label={t(`scoreFormat.${tournament.scoreFormat}`)} />
          <span className="player-tournament__meta-item">
            <CalendarMonthIcon fontSize="inherit" /> {tournament.startDate}
          </span>
          {tournament.location && (
            <span className="player-tournament__meta-item">
              <PlaceIcon fontSize="inherit" /> {tournament.location}
            </span>
          )}
        </div>
        {tournament.status === 'stand_by' && (
          <div className="player-tournament__actions">
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
                href={`/player/tournaments/${tournament.id}/join`}
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
        <Paper className="player-tournament__section player-tournament__my-match">
          <Typography variant="h6" className="player-tournament__section-title">
            {tPlayer('yourMatch')}
          </Typography>
          {myMatches.map((match) => (
            <div key={match.id} className="player-tournament__my-match-row">
              <MatchCard
                match={match}
                competitorNames={competitorNames}
                scoreFormat={tournament.scoreFormat}
                highlighted
              />
              <Button variant="contained" size="small" onClick={() => setScoreMatch(match)}>
                {match.status === 'pending' ? tPlayer('loadResult') : tPlayer('editResult')}
              </Button>
            </div>
          ))}
        </Paper>
      )}

      {rounds.length > 0 && (
        <Paper className="player-tournament__section">
          <Typography variant="h6" className="player-tournament__section-title">
            {tournament.type === 'playoff' ? t('bracket') : t('fixture')}
          </Typography>
          {tournament.type === 'playoff' ? (
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
        <Paper className="player-tournament__section">
          <Typography variant="h6" className="player-tournament__section-title">
            {t('standings')}
          </Typography>
          <StandingsTable type={tournament.type} rows={standings} />
        </Paper>
      )}

      <ScoreDialog
        open={!!scoreMatch}
        scoreFormat={tournament.scoreFormat}
        homeName={
          scoreMatch ? scoreMatch.homeCompetitorIds.map((id) => competitorNames[id] ?? '').join(' / ') : ''
        }
        awayName={
          scoreMatch
            ? (scoreMatch.awayCompetitorIds ?? []).map((id) => competitorNames[id] ?? '').join(' / ')
            : ''
        }
        initialScore={scoreMatch?.score ?? null}
        saving={working}
        onClose={() => setScoreMatch(null)}
        onSave={handleSaveScore}
      />
    </div>
  )
}
