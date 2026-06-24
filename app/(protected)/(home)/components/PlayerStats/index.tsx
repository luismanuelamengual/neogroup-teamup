'use client'

import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import StarIcon from '@mui/icons-material/Star'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useDashboard } from '@/app/(protected)/(home)/hooks/useDashboard'
import StatCard, { StatCardSkeleton } from '@/app/(protected)/(home)/components/StatCard'
import { PlayerStatisticsDto } from '@/app/(protected)/(home)/models/PlayerStatisticsDto'

export default function PlayerStats() {
  const { getPlayerStats } = useDashboard()
  const t = useTranslations('dashboard')
  const [stats, setStats] = useState<PlayerStatisticsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const result = await getPlayerStats()

    setStats(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !stats) {
    return (
      <>
        {Array.from({ length: 8 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </>
    )
  }

  return (
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
      <StatCard
        icon={<LeaderboardIcon />}
        accent="primary"
        value={stats.rankingPoints}
        label={t('player.rankingPoints')}
      />
      <StatCard
        icon={<StarIcon />}
        accent="info"
        value={stats.bestRankingPosition > 0 ? `#${stats.bestRankingPosition}` : '-'}
        label={t('player.bestRankingPosition')}
      />
    </>
  )
}
