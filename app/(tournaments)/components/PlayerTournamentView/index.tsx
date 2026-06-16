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
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import { leaveTournament } from '@/app/(tournaments)/actions/tournament'
import { getTournament, saveMatchResult } from '@/app/(tournaments)/actions/tournament'
import BracketView from '@/app/(tournaments)/components/BracketView'
import FixtureView from '@/app/(tournaments)/components/FixtureView'
import MatchCard from '@/app/(tournaments)/components/MatchCard'
import ScoreDialog from '@/app/(tournaments)/components/ScoreDialog'
import StandingsTable from '@/app/(tournaments)/components/StandingsTable'
import StatusChip from '@/app/(tournaments)/components/StatusChip'
import { MatchDto } from '@/app/(tournaments)/models/MatchDto'
import { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'
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
  const rounds = tournament?.rounds ?? []
  const matches = useMemo(() => tournament?.matches ?? [], [tournament])
  const userEntry = useMemo(
    () => competitors.find((c) => c.userId === userId || c.partnerUserId === userId) ?? null,
    [competitors, userId]
  )
  const competitorNames = useMemo(() => {
    const names: Record<number, string> = {}

    for (const competitor of competitors) {
      names[competitor.id] = competitor.displayName
    }

    return names
  }, [competitors])
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
  const editableMatchIds = myMatches.map((match) => match.id)
  const categoryKeys = useMemo<(string | null)[]>(
    () => (tournament?.categories && tournament.categories.length > 0 ? tournament.categories : [null]),
    [tournament]
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

  const hasCategories = categoryKeys.some((key) => key !== null)
  const categoryGroups = categoryKeys.map((key) => {
    const groupRounds = rounds.filter((round) => (round.category ?? null) === key)
    const groupRoundIds = new Set(groupRounds.map((round) => round.id))
    const groupMatches = matches.filter((match) => groupRoundIds.has(match.roundId))
    const groupCompetitors =
      key === null ? competitors : competitors.filter((competitor) => competitor.category === key)
    const standings =
      tournament.type !== TournamentType.PLAYOFF
        ? computeStandings(
            tournament.type,
            tournament.scoreFormat,
            tournament.settings ?? {},
            groupCompetitors,
            groupMatches
          )
        : []

    return { key, groupRounds, groupMatches, standings }
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
          <Chip size="small" label={t(`discipline.${DISCIPLINE_KEYS[tournament.discipline]}`)} />
          {tournament.subDiscipline && (
            <Chip size="small" label={t(`subDiscipline.${SUB_DISCIPLINE_KEYS[tournament.subDiscipline]}`)} />
          )}
          <Chip size="small" label={t(`type.${TOURNAMENT_TYPE_KEYS[tournament.type]}`)} />
          <Chip size="small" label={t(`scoreFormat.${SCORE_FORMAT_KEYS[tournament.scoreFormat]}`)} />
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

      {hasCategories
        ? categoryGroups.map(({ key, groupRounds, groupMatches, standings }) => (
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="subtitle1" fontWeight={700} fontSize={15}>
                      {tournament.type === TournamentType.PLAYOFF ? t('bracket') : t('fixture')}
                    </Typography>
                    {tournament.type === TournamentType.PLAYOFF ? (
                      <BracketView
                        rounds={groupRounds}
                        matches={groupMatches}
                        competitorNames={competitorNames}
                        scoreFormat={tournament.scoreFormat}
                        highlightedMatchIds={editableMatchIds}
                        editableMatchIds={editableMatchIds}
                        onEditMatch={setScoreMatch}
                      />
                    ) : (
                      <FixtureView
                        type={tournament.type}
                        rounds={groupRounds}
                        matches={groupMatches}
                        competitorNames={competitorNames}
                        scoreFormat={tournament.scoreFormat}
                        highlightedMatchIds={editableMatchIds}
                        editableMatchIds={editableMatchIds}
                        onEditMatch={setScoreMatch}
                      />
                    )}
                  </Box>
                )}
                {standings.length > 0 && groupRounds.length > 0 && (
                  <>
                    <Divider />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Typography variant="subtitle1" fontWeight={700} fontSize={15}>
                        {t('standings')}
                      </Typography>
                      <StandingsTable type={tournament.type} rows={standings} />
                    </Box>
                  </>
                )}
              </AccordionDetails>
            </Accordion>
          ))
        : categoryGroups.map(({ key, groupRounds, groupMatches, standings }) => (
            <Fragment key={key ?? '__all__'}>
              {groupRounds.length > 0 && (
                <Paper className="section">
                  <Typography variant="h6" className="section-title">
                    {tournament.type === TournamentType.PLAYOFF ? t('bracket') : t('fixture')}
                  </Typography>
                  {tournament.type === TournamentType.PLAYOFF ? (
                    <BracketView
                      rounds={groupRounds}
                      matches={groupMatches}
                      competitorNames={competitorNames}
                      scoreFormat={tournament.scoreFormat}
                      highlightedMatchIds={editableMatchIds}
                      editableMatchIds={editableMatchIds}
                      onEditMatch={setScoreMatch}
                    />
                  ) : (
                    <FixtureView
                      type={tournament.type}
                      rounds={groupRounds}
                      matches={groupMatches}
                      competitorNames={competitorNames}
                      scoreFormat={tournament.scoreFormat}
                      highlightedMatchIds={editableMatchIds}
                      editableMatchIds={editableMatchIds}
                      onEditMatch={setScoreMatch}
                    />
                  )}
                </Paper>
              )}
              {standings.length > 0 && groupRounds.length > 0 && (
                <Paper className="section">
                  <Typography variant="h6" className="section-title">
                    {t('standings')}
                  </Typography>
                  <StandingsTable type={tournament.type} rows={standings} />
                </Paper>
              )}
            </Fragment>
          ))}

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
