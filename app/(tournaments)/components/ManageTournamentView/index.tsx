'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import EditIcon from '@mui/icons-material/Edit'
import PlaceIcon from '@mui/icons-material/Place'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  finishTournament,
  getTournamentDetail,
  saveMatchResult,
  startTournament,
  TournamentDetailWithEntry
} from '@/app/(tournaments)/actions/tournament'
import BracketView from '@/app/(tournaments)/components/BracketView'
import EditTournamentDialog from '@/app/(tournaments)/components/EditTournamentDialog'
import FixtureView from '@/app/(tournaments)/components/FixtureView'
import ScoreDialog from '@/app/(tournaments)/components/ScoreDialog'
import StandingsTable from '@/app/(tournaments)/components/StandingsTable'
import StatusChip from '@/app/(tournaments)/components/StatusChip'
import { MatchDto } from '@/app/(tournaments)/models/MatchDto'
import { MatchScore } from '@/app/(tournaments)/models/MatchScore'
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

interface ManageTournamentViewProps {
  tournamentId: number
  appUrl: string
}

export default function ManageTournamentView({ tournamentId, appUrl }: ManageTournamentViewProps) {
  const t = useTranslations('tournaments')
  const tOrganizer = useTranslations('organizer')
  const [detail, setDetail] = useState<TournamentDetailWithEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [scoreMatch, setScoreMatch] = useState<MatchDto | null>(null)
  const [working, setWorking] = useState(false)
  const notify = useNotificationsStore((state) => state.notify)
  const loadDetail = useCallback(async () => {
    const data = await getTournamentDetail(tournamentId)

    setDetail(data && data.isOwner ? data : null)
    setLoading(false)
  }, [tournamentId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const tournament = detail?.tournament ?? null
  const competitors = useMemo(() => detail?.competitors ?? [], [detail])
  const rounds = detail?.rounds ?? []
  const matches = useMemo(() => detail?.matches ?? [], [detail])
  const competitorNames = useMemo(() => {
    const names: Record<number, string> = {}

    for (const competitor of competitors) {
      names[competitor.id] = competitor.displayName
    }

    return names
  }, [competitors])
  const categoryKeys = useMemo<(string | null)[]>(
    () => (tournament?.categories && tournament.categories.length > 0 ? tournament.categories : [null]),
    [tournament]
  )

  if (loading) {
    return (
      <div className="manage-tournament" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <CircularProgress />
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">{tOrganizer('errors.notFound')}</Alert>
  }

  const hasCategories = categoryKeys.some((key) => key !== null)
  const currentRounds = rounds.filter((round) => round.number === tournament.currentRound)
  const currentRoundIds = new Set(currentRounds.map((round) => round.id))
  const currentRoundMatches = matches.filter((match) => currentRoundIds.has(match.roundId))
  const roundIsOpen = currentRounds.some((round) => round.status === RoundStatus.OPEN)
  const editableMatchIds = roundIsOpen
    ? currentRoundMatches
        .filter((match) => currentRounds.find((round) => round.id === match.roundId)?.status === RoundStatus.OPEN)
        .map((match) => match.id)
    : []
  // Per-category fixture/standings data (a single null group when there are no categories).
  const categoryGroups = categoryKeys.map((key) => {
    const groupCompetitors =
      key === null ? competitors : competitors.filter((competitor) => competitor.category === key)
    const groupRounds = rounds.filter((round) => (round.category ?? null) === key)
    const groupRoundIds = new Set(groupRounds.map((round) => round.id))
    const groupMatches = matches.filter((match) => groupRoundIds.has(match.roundId))
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

    return { key, groupCompetitors, groupRounds, groupMatches, standings }
  })

  const runAction = async (action: () => Promise<void>) => {
    setWorking(true)

    try {
      await action()
    } catch (requestError) {
      setWorking(false)
      notify(tOrganizer(`errors.${(requestError as Error).message}`))

      return false
    }

    await loadDetail()
    setWorking(false)

    return true
  }

  const handleStart = () => {
    if (window.confirm(tOrganizer('manage.startConfirm', { count: competitors.length }))) {
      runAction(() => startTournament(tournament.id))
    }
  }

  const handleFinish = () => {
    if (window.confirm(tOrganizer('manage.finishConfirm'))) {
      runAction(() => finishTournament(tournament.id))
    }
  }

  const handleShare = () => {
    const url = `${appUrl}/tournaments/${tournament.id}/join`
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
      <Paper className="header">
        <div className="title-row">
          <div className="name-with-edit">
            <Typography variant="h5" component="h1" className="name">
              {tournament.name}
            </Typography>
            <Tooltip title={tOrganizer('manage.edit')}>
              <IconButton size="small" onClick={() => setEditOpen(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
          <div className="title-actions">
            <StatusChip status={tournament.status} />
          </div>
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
          {tournament.location && (
            <span className="meta-item">
              <PlaceIcon fontSize="inherit" /> {tournament.location}
            </span>
          )}
          <span className="meta-item">
            <CalendarMonthIcon fontSize="inherit" /> {tournament.startDate}
            {tournament.startTime ? ` · ${tournament.startTime}` : ''}
          </span>
        </div>
        <div className="footer">
          <div className="info-area">
            {tournament.status === TournamentStatus.STAND_BY && (
              <Button variant="outlined" color="success" startIcon={<WhatsAppIcon />} onClick={handleShare}>
                {tOrganizer('manage.share')}
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
              >
                {tOrganizer('manage.start')}
              </Button>
            )}
            {tournament.status === TournamentStatus.ONGOING && (
              <Button variant="outlined" color="error" onClick={handleFinish} disabled={working}>
                {tOrganizer('manage.finish')}
              </Button>
            )}
          </div>
        </div>
      </Paper>

      {hasCategories ? (
        categoryGroups.map(({ key, groupCompetitors, groupRounds, groupMatches, standings }) => (
          <Accordion
            key={key ?? '__all__'}
            defaultExpanded
            disableGutters
            elevation={2}
            sx={{ borderRadius: '12px !important', overflow: 'hidden', '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2.5, minHeight: 56 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h6" fontWeight={700}>{key}</Typography>
                <Chip
                  size="small"
                  label={`${groupCompetitors.length} / ${tournament.maxCompetitors}`}
                  color="primary"
                  variant="outlined"
                />
              </Box>
            </AccordionSummary>
            <Divider />
            <AccordionDetails sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={700} fontSize={15}>
                  {tOrganizer('manage.registeredCompetitors')}
                </Typography>
                {groupCompetitors.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {tOrganizer('manage.noCompetitors')}
                  </Typography>
                ) : (
                  <div className="competitors">
                    {groupCompetitors.map((competitor) => (
                      <Chip key={competitor.id} label={competitor.displayName} variant="outlined" />
                    ))}
                  </div>
                )}
              </Box>
              {groupRounds.length > 0 && (
                <>
                  <Divider />
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
                        editableMatchIds={editableMatchIds}
                        onEditMatch={setScoreMatch}
                      />
                    )}
                  </Box>
                </>
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
      ) : (
        <>
          <Paper className="section">
            <Typography variant="h6" className="section-title">
              {tOrganizer('manage.registeredCompetitors')} ({competitors.length} / {tournament.maxCompetitors})
            </Typography>
            {competitors.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {tOrganizer('manage.noCompetitors')}
              </Typography>
            ) : (
              <div className="competitors">
                {competitors.map((competitor) => (
                  <Chip key={competitor.id} label={competitor.displayName} variant="outlined" />
                ))}
              </div>
            )}
          </Paper>
          {categoryGroups.map(({ key, groupRounds, groupMatches, standings }) => (
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
        </>
      )}

      <EditTournamentDialog
        open={editOpen}
        tournament={tournament}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          loadDetail()
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
