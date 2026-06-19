'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import GroupsIcon from '@mui/icons-material/Groups'
import PlaceIcon from '@mui/icons-material/Place'
import Paper from '@mui/material/Paper'
import MuiSkeleton from '@mui/material/Skeleton'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import StatusChip from '@/app/(protected)/(tournaments)/components/StatusChip'
import { DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDisciplineNames } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentTypeNames } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { TournamentDto } from '../../models/TournamentDto'

interface TournamentCardProps {
  tournament: TournamentDto
}

export default function TournamentCard({ tournament }: TournamentCardProps) {
  const router = useRouter()
  const t = useTranslations('tournaments')

  const handleClick = async () => {
    router.push(`/tournaments/${tournament.id}`)
  }

  const hasCategories = tournament.categories != null && tournament.categories.length > 0

  return (
    <Paper className="tournament-card" onClick={handleClick}>
      <div className="header">
        <span className="name">{tournament.name}</span>
        <StatusChip status={tournament.status} />
      </div>
      <div className="tags">
        <span className="tag">{t(`discipline.${DisciplineNames[tournament.discipline]}`)}</span>
        {tournament.subDiscipline && (
          <span className="tag">{t(`subDiscipline.${SubDisciplineNames[tournament.subDiscipline]}`)}</span>
        )}
        <span className="tag">{t(`type.${TournamentTypeNames[tournament.type]}`)}</span>
      </div>
      <div className="details">
        {tournament.location && (
          <span className="detail">
            <PlaceIcon fontSize="inherit" />
            {tournament.location}
          </span>
        )}
        <span className="detail">
          <CalendarMonthIcon fontSize="inherit" />
          {tournament.startDate}
          {tournament.startTime ? ` · ${tournament.startTime}` : ''}
        </span>
      </div>
      <div className="categories">
        {!hasCategories && (
          <div className="category-chip">
            <label>Categoría única</label>
            <div className="inscriptions">
              <GroupsIcon fontSize="inherit" />
              {tournament.competitors?.length ?? 0} / {tournament.maxCompetitors}
            </div>
          </div>
        )}
        {hasCategories && (
          <>
            {tournament.categories!.map((category) => {
              const count = tournament.competitors?.filter((c) => c.category === category).length

              return (
                <div key={category} className="category-chip">
                  <label>{category}</label>
                  {count != null && (
                    <div className="inscriptions">
                      <GroupsIcon fontSize="inherit" />
                      {count} / {tournament.maxCompetitors}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </Paper>
  )
}

export function TournamentCardSkeleton() {
  return (
    <Paper className="tournament-card" sx={{ pointerEvents: 'none' }}>
      <div className="header">
        <MuiSkeleton variant="text" width="55%" height={22} />
        <MuiSkeleton variant="rounded" width={72} height={24} sx={{ borderRadius: 12 }} />
      </div>
      <div className="tags">
        <MuiSkeleton variant="rounded" width={80} height={20} sx={{ borderRadius: 8 }} />
        <MuiSkeleton variant="rounded" width={60} height={20} sx={{ borderRadius: 8 }} />
        <MuiSkeleton variant="rounded" width={70} height={20} sx={{ borderRadius: 8 }} />
      </div>
      <div className="details">
        <MuiSkeleton variant="text" width="40%" height={18} />
        <MuiSkeleton variant="text" width="35%" height={18} />
      </div>
    </Paper>
  )
}
