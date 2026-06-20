'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import ApartmentIcon from '@mui/icons-material/Apartment'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import GroupsIcon from '@mui/icons-material/Groups'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import SportsScoreIcon from '@mui/icons-material/SportsScore'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import { getOrganizerDashboard } from '@/app/(protected)/(home)/actions/dashboard'
import StatCard, { StatCardSkeleton } from '@/app/(protected)/(home)/components/StatCard'
import { OrganizerDashboardDto } from '@/app/(protected)/(home)/models/OrganizerDashboardDto'
import TournamentCard from '@/app/(protected)/(tournaments)/components/TournamentCard'

export default function OrganizerDashboard() {
  const t = useTranslations('dashboard')
  const user = useUserStore((state) => state.user)
  const [data, setData] = useState<OrganizerDashboardDto | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const result = await getOrganizerDashboard()

    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const firstName = user?.firstName || user?.displayName || ''
  const organization = data?.organization
  const activeTournaments = data?.activeTournaments ?? []

  return (
    <div className="organizer-dashboard">
      <Paper className="hero" elevation={0}>
        <div className="hero-text">
          <Typography variant="h5" component="h1" className="greeting">
            {t('greetingOrganizer', { name: firstName })}
          </Typography>
          <Typography className="subtitle">{t('subtitleOrganizer')}</Typography>
        </div>
        <Button href="/tournaments/new" variant="contained" startIcon={<AddIcon />} className="hero-action">
          {t('createTournament')}
        </Button>
      </Paper>

      <section className="block">
        <div className="stats">
          {loading || !organization ? (
            Array.from({ length: 9 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={<ApartmentIcon />}
                accent="info"
                value={organization.tournamentsTotal}
                label={t('organizer.orgTournamentsTotal')}
              />
              <StatCard
                icon={<LocalFireDepartmentIcon />}
                accent="primary"
                value={organization.tournamentsActive}
                label={t('organizer.orgTournamentsActive')}
              />
              <StatCard
                icon={<CheckCircleIcon />}
                accent="neutral"
                value={organization.tournamentsFinished}
                label={t('organizer.orgTournamentsFinished')}
              />
              <StatCard
                icon={<GroupsIcon />}
                accent="success"
                value={organization.competitorsTotal}
                label={t('organizer.orgCompetitorsTotal')}
              />
              <StatCard
                icon={<QueryStatsIcon />}
                accent="neutral"
                value={organization.avgCompetitors}
                label={t('organizer.orgAvgCompetitors')}
              />
              <StatCard
                icon={<PeopleAltIcon />}
                accent="info"
                value={organization.distinctPlayers}
                label={t('organizer.orgDistinctPlayers')}
              />
              <StatCard
                icon={<SportsScoreIcon />}
                accent="neutral"
                value={organization.matchesTotal}
                label={t('organizer.orgMatchesTotal')}
              />
              <StatCard
                icon={<SportsTennisIcon />}
                accent="success"
                value={organization.matchesPlayed}
                label={t('organizer.orgMatchesPlayed')}
              />
              <StatCard
                icon={<PendingActionsIcon />}
                accent="amber"
                value={organization.matchesPending}
                label={t('organizer.orgMatchesPending')}
              />
            </>
          )}
        </div>
      </section>
      <section className="block">
        <Typography variant="h6" className="block-title">
          {t('organizer.activeTournamentsTitle')}
        </Typography>
        {!loading && activeTournaments.length === 0 ? (
          <div className="empty-tournaments">
            <Typography color="text.secondary">{t('organizer.noActiveTournaments')}</Typography>
            <Button href="/tournaments/new" variant="contained" startIcon={<AddIcon />}>
              {t('createTournament')}
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
    </div>
  )
}
