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
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useDashboard } from '@/app/(protected)/(home)/hooks/useDashboard'
import StatCard, { StatCardSkeleton } from '@/app/(protected)/(home)/components/StatCard'
import { OrganizationStatisticsDto } from '@/app/(protected)/(home)/models/OrganizationStatisticsDto'

export default function OrganizationStats() {
  const { getOrganizationStats } = useDashboard()
  const t = useTranslations('dashboard')
  const [stats, setStats] = useState<OrganizationStatisticsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const result = await getOrganizationStats()

    setStats(result)
    setLoading(false)
  }, [])

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
      <StatCard
        icon={<ApartmentIcon />}
        accent="info"
        value={stats.tournamentsTotal}
        label={t('organizer.orgTournamentsTotal')}
      />
      <StatCard
        icon={<LocalFireDepartmentIcon />}
        accent="primary"
        value={stats.tournamentsActive}
        label={t('organizer.orgTournamentsActive')}
      />
      <StatCard
        icon={<CheckCircleIcon />}
        accent="neutral"
        value={stats.tournamentsFinished}
        label={t('organizer.orgTournamentsFinished')}
      />
      <StatCard
        icon={<GroupsIcon />}
        accent="success"
        value={stats.competitorsTotal}
        label={t('organizer.orgCompetitorsTotal')}
      />
      <StatCard
        icon={<QueryStatsIcon />}
        accent="neutral"
        value={stats.avgCompetitors}
        label={t('organizer.orgAvgCompetitors')}
      />
      <StatCard
        icon={<PeopleAltIcon />}
        accent="info"
        value={stats.distinctPlayers}
        label={t('organizer.orgDistinctPlayers')}
      />
      <StatCard
        icon={<SportsScoreIcon />}
        accent="neutral"
        value={stats.matchesTotal}
        label={t('organizer.orgMatchesTotal')}
      />
      <StatCard
        icon={<SportsTennisIcon />}
        accent="success"
        value={stats.matchesPlayed}
        label={t('organizer.orgMatchesPlayed')}
      />
      <StatCard
        icon={<PendingActionsIcon />}
        accent="amber"
        value={stats.matchesPending}
        label={t('organizer.orgMatchesPending')}
      />
      <StatCard
        icon={<LeaderboardIcon />}
        accent="primary"
        value={stats.rankingPointsAwarded}
        label={t('organizer.orgRankingPoints')}
      />
      <StatCard
        icon={<MilitaryTechIcon />}
        accent="success"
        value={stats.rankedPlayers}
        label={t('organizer.orgRankedPlayers')}
      />
    </>
  )
}
