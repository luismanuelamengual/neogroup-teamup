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
import {
  DISCIPLINE_KEYS,
  SUB_DISCIPLINE_KEYS,
  TOURNAMENT_TYPE_KEYS
} from '@/app/(protected)/(tournaments)/utils/labels'
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

  return (
    <Paper className="tournament-card" onClick={handleClick}>
      <div className="header">
        <span className="name">{tournament.name}</span>
        <StatusChip status={tournament.status} />
      </div>
      <div className="tags">
        <span className="tag">{t(`discipline.${DISCIPLINE_KEYS[tournament.discipline]}`)}</span>
        {tournament.subDiscipline && (
          <span className="tag">{t(`subDiscipline.${SUB_DISCIPLINE_KEYS[tournament.subDiscipline]}`)}</span>
        )}
        <span className="tag">{t(`type.${TOURNAMENT_TYPE_KEYS[tournament.type]}`)}</span>
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
        {tournament.competitors != null && (
          <span className="detail">
            <GroupsIcon fontSize="inherit" />
            {tournament.competitors.length} / {tournament.maxCompetitors}
          </span>
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
