'use client'

import './ManageTournamentView.styles.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import EditIcon from '@mui/icons-material/Edit'
import FlagIcon from '@mui/icons-material/Flag'
import PlaceIcon from '@mui/icons-material/Place'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import {
  closeCurrentRound,
  finishTournament,
  saveMatchResult,
  startNextRound,
  startTournament
} from '@/app/_actions/tournament.actions'
import BracketView from '@/app/_components/tournament/BracketView'
import FixtureView from '@/app/_components/tournament/FixtureView'
import ScoreDialog from '@/app/_components/tournament/ScoreDialog'
import StandingsTable from '@/app/_components/tournament/StandingsTable'
import StatusChip from '@/app/_components/tournament/StatusChip'
import { CompetitorDto, MatchDto, RoundDto, TournamentDto } from '@/app/_models/dtos'
import { MatchScore } from '@/app/_models/types'
import { useNotificationsStore } from '@/app/_stores/notifications.store'
import { computeStandings } from '@/app/_utils/standings'
import { getTotalRounds } from '@/app/_utils/tournament-engine'
import EditTournamentDialog from '@/app/(organizer)/organizer/tournaments/[id]/_components/EditTournamentDialog'

interface ManageTournamentViewProps {
  tournament: TournamentDto
  competitors: CompetitorDto[]
  rounds: RoundDto[]
  matches: MatchDto[]
  appUrl: string
}

export default function ManageTournamentView({
  tournament,
  competitors,
  rounds,
  matches,
  appUrl
}: ManageTournamentViewProps) {
  const t = useTranslations('tournaments')
  const tOrganizer = useTranslations('organizer')
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
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
  const currentRoundMatches = currentRound ? matches.filter((match) => match.roundId === currentRound.id) : []
  const roundIsOpen = currentRound?.status === 'open'
  const allResolved = currentRoundMatches.every((match) => match.status !== 'pending')
  const totalRounds = getTotalRounds(tournament.type, tournament.settings, competitors.length)
  const hasMoreRounds = tournament.currentRound < totalRounds
  const editableMatchIds = roundIsOpen ? currentRoundMatches.map((match) => match.id) : []
  const standings = useMemo(
    () =>
      tournament.type !== 'playoff'
        ? computeStandings(tournament.type, tournament.scoreFormat, tournament.settings, competitors, matches)
        : [],
    [tournament, competitors, matches]
  )

  const runAction = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    setWorking(true)

    const result = await action()

    setWorking(false)

    if (!result.success) {
      notify(tOrganizer(`errors.${result.error ?? 'invalidStatus'}`))

      return false
    }

    router.refresh()

    return true
  }

  const handleStart = () => {
    if (window.confirm(tOrganizer('manage.startConfirm', { count: competitors.length }))) {
      runAction(() => startTournament(tournament.id))
    }
  }

  const handleCloseRound = () => {
    if (window.confirm(tOrganizer('manage.closeRoundConfirm'))) {
      runAction(() => closeCurrentRound(tournament.id))
    }
  }

  const handleNextRound = () => runAction(() => startNextRound(tournament.id))

  const handleFinish = () => {
    if (window.confirm(tOrganizer('manage.finishConfirm'))) {
      runAction(() => finishTournament(tournament.id))
    }
  }

  const handleShare = () => {
    const url = `${appUrl}/player/tournaments/${tournament.id}/join`
    const message = tOrganizer('manage.shareMessage', { name: tournament.name, url })

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
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
    <div className="manage-tournament">
      <Paper className="manage-tournament__header">
        <div className="manage-tournament__title-row">
          <Typography variant="h5" component="h1" className="manage-tournament__name">
            {tournament.name}
          </Typography>
          <div className="manage-tournament__title-actions">
            <StatusChip status={tournament.status} />
            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditOpen(true)}>
              {tOrganizer('manage.edit')}
            </Button>
          </div>
        </div>
        {tournament.description && (
          <Typography variant="body2" color="text.secondary">
            {tournament.description}
          </Typography>
        )}
        <div className="manage-tournament__meta">
          <Chip size="small" label={t(`discipline.${tournament.discipline}`)} />
          <Chip size="small" label={t(`type.${tournament.type}`)} />
          <Chip size="small" label={t(`scoreFormat.${tournament.scoreFormat}`)} />
          <span className="manage-tournament__meta-item">
            <CalendarMonthIcon fontSize="inherit" /> {tournament.startDate}
          </span>
          {tournament.location && (
            <span className="manage-tournament__meta-item">
              <PlaceIcon fontSize="inherit" /> {tournament.location}
            </span>
          )}
        </div>
        <div className="manage-tournament__actions">
          {tournament.status === 'stand_by' && (
            <>
              <Button variant="outlined" color="success" startIcon={<WhatsAppIcon />} onClick={handleShare}>
                {tOrganizer('manage.share')}
              </Button>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={handleStart}
                disabled={working || competitors.length < 2}
              >
                {tOrganizer('manage.start')}
              </Button>
            </>
          )}
          {tournament.status === 'ongoing' && roundIsOpen && (
            <Button
              variant="contained"
              startIcon={<FlagIcon />}
              onClick={handleCloseRound}
              disabled={working || !allResolved}
            >
              {tOrganizer('manage.closeRound')}
            </Button>
          )}
          {tournament.status === 'ongoing' && !roundIsOpen && hasMoreRounds && (
            <Button variant="contained" startIcon={<SkipNextIcon />} onClick={handleNextRound} disabled={working}>
              {tOrganizer('manage.nextRound')}
            </Button>
          )}
          {tournament.status === 'ongoing' && !roundIsOpen && (
            <Button variant="outlined" color="error" onClick={handleFinish} disabled={working}>
              {tOrganizer('manage.finish')}
            </Button>
          )}
        </div>
        {tournament.status === 'ongoing' && !roundIsOpen && !hasMoreRounds && (
          <Alert severity="info">{tOrganizer('manage.allRoundsPlayed')}</Alert>
        )}
      </Paper>

      <Paper className="manage-tournament__section">
        <Typography variant="h6" className="manage-tournament__section-title">
          {tOrganizer('manage.registeredCompetitors')} ({competitors.length} / {tournament.maxCompetitors})
        </Typography>
        {competitors.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {tOrganizer('manage.noCompetitors')}
          </Typography>
        ) : (
          <div className="manage-tournament__competitors">
            {competitors.map((competitor) => (
              <Chip key={competitor.id} label={competitor.displayName} variant="outlined" />
            ))}
          </div>
        )}
      </Paper>

      {rounds.length > 0 && (
        <Paper className="manage-tournament__section">
          <Typography variant="h6" className="manage-tournament__section-title">
            {tournament.type === 'playoff' ? t('bracket') : t('fixture')}
          </Typography>
          {tournament.type === 'playoff' ? (
            <BracketView
              rounds={rounds}
              matches={matches}
              competitorNames={competitorNames}
              scoreFormat={tournament.scoreFormat}
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
              editableMatchIds={editableMatchIds}
              onEditMatch={setScoreMatch}
            />
          )}
        </Paper>
      )}

      {standings.length > 0 && rounds.length > 0 && (
        <Paper className="manage-tournament__section">
          <Typography variant="h6" className="manage-tournament__section-title">
            {t('standings')}
          </Typography>
          <StandingsTable type={tournament.type} rows={standings} />
        </Paper>
      )}

      <EditTournamentDialog
        open={editOpen}
        tournament={tournament}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          router.refresh()
        }}
      />
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
