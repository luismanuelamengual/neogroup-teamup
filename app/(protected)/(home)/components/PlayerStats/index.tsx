'use client'

import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import StarIcon from '@mui/icons-material/Star'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium'
import { useCallback, useEffect, useState } from 'react'
import StatCard, { StatCardSkeleton } from '@/app/(protected)/(home)/components/StatCard'
import { useDashboard } from '@/app/(protected)/(home)/hooks/useDashboard'
import { PlayerStatisticsDto } from '@/app/(protected)/(home)/models/PlayerStatisticsDto'

export default function PlayerStats() {
  const { getPlayerStats } = useDashboard()
  const [stats, setStats] = useState<PlayerStatisticsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const result = await getPlayerStats()

    setStats(result)
    setLoading(false)
  }, [getPlayerStats])

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
      <StatCard icon={<EmojiEventsIcon />} accent="primary" value={stats.tournamentsPlayed} label="Torneos jugados" />
      <StatCard
        icon={<LocalFireDepartmentIcon />}
        accent="info"
        value={stats.activeTournaments}
        label="Torneos activos"
      />
      <StatCard icon={<SportsTennisIcon />} accent="neutral" value={stats.matchesPlayed} label="Partidos jugados" />
      <StatCard
        icon={<TrendingUpIcon />}
        accent="success"
        value={`${stats.winRate}%`}
        label="Efectividad"
        hint={`${stats.matchesWon} de ${stats.matchesPlayed} ganados`}
      />
      <StatCard icon={<WorkspacePremiumIcon />} accent="amber" value={stats.titles} label="Títulos" />
      <StatCard icon={<MilitaryTechIcon />} accent="amber" value={stats.podiums} label="Podios" />
      <StatCard icon={<LeaderboardIcon />} accent="primary" value={stats.rankingPoints} label="Puntos de ranking" />
      <StatCard
        icon={<StarIcon />}
        accent="info"
        value={stats.bestRankingPosition > 0 ? `#${stats.bestRankingPosition}` : '-'}
        label="Mejor posición"
      />
    </>
  )
}
