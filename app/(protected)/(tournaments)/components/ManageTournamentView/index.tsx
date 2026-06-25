'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import EditIcon from '@mui/icons-material/Edit'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlaceIcon from '@mui/icons-material/Place'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import CompetitorsList from '@/app/(protected)/(tournaments)/components/CompetitorsList'
import EditTournamentDialog from '@/app/(protected)/(tournaments)/components/EditTournamentDialog'
import ScoreDialog from '@/app/(protected)/(tournaments)/components/ScoreDialog'
import StatusChip from '@/app/(protected)/(tournaments)/components/StatusChip'
import TournamentRoundsView from '@/app/(protected)/(tournaments)/components/TournamentRoundsView'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { ScoreFormatNames } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDisciplineNames } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'

interface ManageTournamentViewProps {
  tournamentId: number
  appUrl: string
}

export default function ManageTournamentView({ tournamentId, appUrl }: ManageTournamentViewProps) {
  const t = useTranslations('tournaments')
  const tOrganizer = useTranslations('organizer')
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [scoreMatch, setScoreMatch] = useState<MatchDto | null>(null)
  const [working, setWorking] = useState(false)
  const { finishTournament, getTournament, saveMatchResult, startTournament } = useTournaments()
  const userId = useUserStore((state) => state.user?.id ?? null)
  const isOwner = tournament != null && userId != null && tournament.ownerId === userId
  const competitors = useMemo(() => tournament?.competitors ?? [], [tournament])
  const rounds = tournament?.rounds ?? []
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
      <div className="manage-tournament">
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

  if (!tournament || !isOwner) {
    return <Alert severity="error">{tOrganizer('errors.notFound')}</Alert>
  }

  // The single category (categoryId = null) renders the flat layout; real
  // categories render one accordion each.
  const categoryGroups = categoryKeys.map((key) => {
    const groupCompetitors = competitors.filter((competitor) => competitor.tournamentCategoryId === key)
    const groupRounds = rounds.filter((round) => round.tournamentCategoryId === key)

    return { key, groupCompetitors, groupRounds }
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
          <Chip size="small" label={t(`discipline.${DisciplineNames[tournament.discipline]}`)} />
          {tournament.subDiscipline && (
            <Chip size="small" label={t(`subDiscipline.${SubDisciplineNames[tournament.subDiscipline]}`)} />
          )}
          <Chip size="small" label={t(`type.${TournamentTypeNames[tournament.type]}`)} />
          <Chip size="small" label={t(`scoreFormat.${ScoreFormatNames[tournament.scoreFormat]}`)} />
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
                loading={working}
              >
                {tOrganizer('manage.start')}
              </Button>
            )}
            {tournament.status === TournamentStatus.ONGOING && (
              <Button variant="outlined" color="error" onClick={handleFinish} disabled={working} loading={working}>
                {tOrganizer('manage.finish')}
              </Button>
            )}
          </div>
        </div>
      </Paper>

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
              <Typography variant="subtitle1" className="category-subtitle">
                {tOrganizer('manage.registeredCompetitors')}
              </Typography>
              <CompetitorsList tournament={tournament} category={key} />
            </div>
            {groupRounds.length > 0 && (
              <>
                <Divider />
                <TournamentRoundsView
                  tournament={tournament}
                  category={key}
                  organizerMode
                  onEditMatch={setScoreMatch}
                />
              </>
            )}
          </AccordionDetails>
        </Accordion>
      ))}

      <EditTournamentDialog
        open={editOpen}
        tournament={tournament}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          loadTournament()
        }}
      />
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
