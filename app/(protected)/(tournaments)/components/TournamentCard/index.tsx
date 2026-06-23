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

  const categories = tournament.categories ?? []
  const hasCategories = categories.some((category) => category.categoryId != null)
  const singleCategory = categories[0]

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
            <label>{t(`uniqueCategory`)}</label>
            <div className="inscriptions">
              <GroupsIcon fontSize="inherit" />
              {tournament.competitors?.length ?? 0} / {singleCategory?.maxCompetitors ?? 0}
            </div>
          </div>
        )}
        {hasCategories && (
          <>
            {categories
              .filter((category) => category.categoryId != null)
              .map((category) => {
                const count = tournament.competitors?.filter((c) => c.tournamentCategoryId === category.id).length

                return (
                  <div key={category.id} className="category-chip">
                    <label>{category.category?.name}</label>
                    {count != null && (
                      <div className="inscriptions">
                        <GroupsIcon fontSize="inherit" />
                        {count} / {category.maxCompetitors}
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
    <Paper className="tournament-card" sx={{ pointerEvents: 'none', transform: 'none' }}>
      <div className="header">
        <MuiSkeleton variant="text" width={200} height={24} sx={{ transform: 'none' }} />
        <MuiSkeleton variant="rounded" width={72} height={24} sx={{ borderRadius: 12, transform: 'none' }} />
      </div>
      <div className="tags">
        <MuiSkeleton variant="rounded" width={60} height={22} sx={{ borderRadius: 8, transform: 'none' }} />
        <MuiSkeleton variant="rounded" width={90} height={22} sx={{ borderRadius: 8, transform: 'none' }} />
        <MuiSkeleton variant="rounded" width={80} height={22} sx={{ borderRadius: 8, transform: 'none' }} />
      </div>
      <div className="details">
        <MuiSkeleton variant="text" width={150} height={19} sx={{ transform: 'none' }} />
        <MuiSkeleton variant="text" width={100} height={19} sx={{ transform: 'none' }} />
      </div>
      <div className="categories">
        <MuiSkeleton className="category-chip" height={22} sx={{ borderRadius: '16px', transform: 'none' }} />
      </div>
    </Paper>
  )
}
