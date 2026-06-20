'use client'

import './index.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import SearchIcon from '@mui/icons-material/Search'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import { getPlayerDashboard } from '@/app/(protected)/(home)/actions/dashboard'
import StatCard, { StatCardSkeleton } from '@/app/(protected)/(home)/components/StatCard'
import { PlayerDashboardDto } from '@/app/(protected)/(home)/models/PlayerDashboardDto'
import { saveMatchResult } from '@/app/(protected)/(tournaments)/actions/tournament'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import ScoreDialog from '@/app/(protected)/(tournaments)/components/ScoreDialog'
import TournamentCard from '@/app/(protected)/(tournaments)/components/TournamentCard'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { useNotificationsStore } from '@/app/stores/notifications.store'

interface ActiveMatch {
  match: MatchDto
  tournament: TournamentDto
}

export default function PlayerDashboard() {
  const t = useTranslations('dashboard')
  const tPlayer = useTranslations('player')
  const notify = useNotificationsStore((state) => state.notify)
  const user = useUserStore((state) => state.user)
  const userId = user?.id ?? null
  const [data, setData] = useState<PlayerDashboardDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoreMatch, setScoreMatch] = useState<ActiveMatch | null>(null)
  const [working, setWorking] = useState(false)
  const load = useCallback(async () => {
    const result = await getPlayerDashboard()

    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activeMatches = useMemo<ActiveMatch[]>(() => {
    if (!data || userId == null) {
      return []
    }

    const result: ActiveMatch[] = []

    for (const tournament of data.activeTournaments) {
      if (tournament.status !== TournamentStatus.ONGOING) {
        continue
      }

      const competitor = (tournament.competitors ?? []).find((c) => c.userId === userId || c.partnerUserId === userId)

      if (!competitor) {
        continue
      }

      const openRoundIds = new Set(
        (tournament.rounds ?? [])
          .filter((round) => round.number === tournament.currentRound && round.status === RoundStatus.OPEN)
          .map((round) => round.id)
      )

      for (const match of tournament.matches ?? []) {
        if (
          openRoundIds.has(match.roundId) &&
          match.awayCompetitorIds !== null &&
          (match.homeCompetitorIds.includes(competitor.id) || match.awayCompetitorIds.includes(competitor.id))
        ) {
          result.push({ match, tournament })
        }
      }
    }

    return result
  }, [data, userId])

  const handleSaveScore = async (score: MatchScore) => {
    if (!scoreMatch) {
      return
    }

    setWorking(true)

    try {
      await saveMatchResult(scoreMatch.match.id, score)
    } catch (requestError) {
      setWorking(false)
      notify(tPlayer(`errors.${(requestError as Error).message}`))

      return
    }

    setScoreMatch(null)
    await load()
    setWorking(false)
  }

  const firstName = user?.firstName || user?.displayName || ''
  const stats = data?.stats
  const activeTournaments = data?.activeTournaments ?? []

  return (
    <div className="player-dashboard">
      <Paper className="hero" elevation={0}>
        <div className="hero-text">
          <Typography variant="h5" component="h1" className="greeting">
            {t('greetingPlayer', { name: firstName })}
          </Typography>
          <Typography className="subtitle">{t('subtitlePlayer')}</Typography>
        </div>
        <EmojiEventsIcon className="hero-icon" />
      </Paper>

      <section className="stats">
        {loading || !stats ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              icon={<EmojiEventsIcon />}
              accent="primary"
              value={stats.tournamentsPlayed}
              label={t('player.tournamentsPlayed')}
            />
            <StatCard
              icon={<LocalFireDepartmentIcon />}
              accent="info"
              value={stats.activeTournaments}
              label={t('player.activeTournaments')}
            />
            <StatCard
              icon={<SportsTennisIcon />}
              accent="neutral"
              value={stats.matchesPlayed}
              label={t('player.matchesPlayed')}
            />
            <StatCard
              icon={<TrendingUpIcon />}
              accent="success"
              value={`${stats.winRate}%`}
              label={t('player.winRate')}
              hint={t('player.matchesWonHint', { won: stats.matchesWon, played: stats.matchesPlayed })}
            />
            <StatCard icon={<WorkspacePremiumIcon />} accent="amber" value={stats.titles} label={t('player.titles')} />
            <StatCard icon={<MilitaryTechIcon />} accent="amber" value={stats.podiums} label={t('player.podiums')} />
          </>
        )}
      </section>

      <section className="panel">
        <Typography variant="h6" className="panel-title">
          {t('player.nextMatchTitle')}
        </Typography>
        {!loading && activeMatches.length === 0 && (
          <Typography color="text.secondary" className="empty">
            {t('player.noActiveMatch')}
          </Typography>
        )}
        <div className="match-list">
          {activeMatches.map(({ match, tournament }) => (
            <Paper key={match.id} className="match-row" elevation={0}>
              <div className="match-info">
                <Link href={`/tournaments/${tournament.id}`} className="match-tournament">
                  {tournament.name}
                </Link>
                <MatchCard match={match} tournament={tournament} highlighted />
              </div>
              <Button variant="contained" size="small" onClick={() => setScoreMatch({ match, tournament })}>
                {match.status === MatchStatus.PENDING ? t('player.loadResult') : t('player.editResult')}
              </Button>
            </Paper>
          ))}
        </div>
      </section>

      <section className="panel">
        <Typography variant="h6" className="panel-title">
          {t('player.activeTournamentsTitle')}
        </Typography>
        {!loading && activeTournaments.length === 0 ? (
          <div className="empty-tournaments">
            <Typography color="text.secondary">{t('player.noActiveTournaments')}</Typography>
            <Button component={Link} href="/tournaments" variant="contained" startIcon={<SearchIcon />}>
              {t('player.findTournaments')}
            </Button>
          </div>
        ) : (
          <div className="tournament-list">
            {activeTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
        )}
      </section>

      {scoreMatch && (
        <ScoreDialog
          open={!!scoreMatch}
          tournament={scoreMatch.tournament}
          match={scoreMatch.match}
          saving={working}
          onClose={() => setScoreMatch(null)}
          onSave={handleSaveScore}
        />
      )}
    </div>
  )
}
