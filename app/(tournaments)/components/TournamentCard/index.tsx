'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import GroupsIcon from '@mui/icons-material/Groups'
import PlaceIcon from '@mui/icons-material/Place'
import Paper from '@mui/material/Paper'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import StatusChip from '@/app/(tournaments)/components/StatusChip'
import { Tournament } from '@/app/(tournaments)/models/TournamentDto'
import { DISCIPLINE_KEYS, SUB_DISCIPLINE_KEYS, TOURNAMENT_TYPE_KEYS } from '@/app/(tournaments)/utils/labels'

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
        {tournament.competitorsCount != null && (
          <span className="detail">
            <GroupsIcon fontSize="inherit" />
            {tournament.competitorsCount} / {tournament.maxCompetitors}
          </span>
        )}
      </div>
    </Paper>
  )
}
