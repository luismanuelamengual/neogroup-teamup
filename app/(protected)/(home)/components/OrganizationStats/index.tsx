'use client'

import ApartmentIcon from '@mui/icons-material/Apartment'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import GroupsIcon from '@mui/icons-material/Groups'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import SportsScoreIcon from '@mui/icons-material/SportsScore'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import { useCallback, useEffect, useState } from 'react'
import StatCard, { StatCardSkeleton } from '@/app/(protected)/(home)/components/StatCard'
import { useDashboard } from '@/app/(protected)/(home)/hooks/useDashboard'
import { OrganizationStatisticsDto } from '@/app/(protected)/(home)/models/OrganizationStatisticsDto'

export default function OrganizationStats() {
  const { getOrganizationStats } = useDashboard()
  const [stats, setStats] = useState<OrganizationStatisticsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const result = await getOrganizationStats()

    setStats(result)
    setLoading(false)
  }, [getOrganizationStats])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !stats) {
    return (
      <>
        {Array.from({ length: 11 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </>
    )
  }

  return (
    <>
      <StatCard icon={<ApartmentIcon />} accent="info" value={stats.tournamentsTotal} label="Torneos totales" />
      <StatCard
        icon={<LocalFireDepartmentIcon />}
        accent="primary"
        value={stats.tournamentsActive}
        label="Torneos activos"
      />
      <StatCard
        icon={<CheckCircleIcon />}
        accent="neutral"
        value={stats.tournamentsFinished}
        label="Torneos finalizados"
      />
      <StatCard icon={<GroupsIcon />} accent="success" value={stats.competitorsTotal} label="Inscriptos totales" />
      <StatCard icon={<QueryStatsIcon />} accent="neutral" value={stats.avgCompetitors} label="Promedio x torneo" />
      <StatCard icon={<PeopleAltIcon />} accent="info" value={stats.distinctPlayers} label="Jugadores únicos" />
      <StatCard icon={<SportsScoreIcon />} accent="neutral" value={stats.matchesTotal} label="Partidos totales" />
      <StatCard icon={<SportsTennisIcon />} accent="success" value={stats.matchesPlayed} label="Partidos jugados" />
      <StatCard icon={<PendingActionsIcon />} accent="amber" value={stats.matchesPending} label="Partidos pendientes" />
      <StatCard
        icon={<LeaderboardIcon />}
        accent="primary"
        value={stats.rankingPointsAwarded}
        label="Puntos de ranking"
      />
      <StatCard icon={<MilitaryTechIcon />} accent="success" value={stats.rankedPlayers} label="Jugadores rankeados" />
    </>
  )
}
