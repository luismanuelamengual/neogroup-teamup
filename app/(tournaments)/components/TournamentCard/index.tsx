'use client'

import './index.scss'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import GroupsIcon from '@mui/icons-material/Groups'
import PlaceIcon from '@mui/icons-material/Place'
import Paper from '@mui/material/Paper'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import StatusChip from '@/app/(tournaments)/components/StatusChip'
import { TournamentDto } from '@/app/(tournaments)/models/Tournament'
import { DISCIPLINE_KEYS, SUB_DISCIPLINE_KEYS, TOURNAMENT_TYPE_KEYS } from '@/app/(tournaments)/utils/labels'

interface TournamentCardProps {
  tournament: TournamentDto
  href: string
}

export default function TournamentCard({ tournament, href }: TournamentCardProps) {
  const t = useTranslations('tournaments')

  return (
    <Link href={href} className="tournament-card__link">
      <Paper className="tournament-card">
        <div className="tournament-card__header">
          <span className="tournament-card__name">{tournament.name}</span>
          <StatusChip status={tournament.status} />
        </div>
        <div className="tournament-card__tags">
          <span className="tournament-card__tag">{t(`discipline.${DISCIPLINE_KEYS[tournament.discipline]}`)}</span>
          {tournament.subDiscipline && (
            <span className="tournament-card__tag">
              {t(`subDiscipline.${SUB_DISCIPLINE_KEYS[tournament.subDiscipline]}`)}
            </span>
          )}
          <span className="tournament-card__tag">{t(`type.${TOURNAMENT_TYPE_KEYS[tournament.type]}`)}</span>
        </div>
        <div className="tournament-card__details">
          <span className="tournament-card__detail">
            <CalendarMonthIcon fontSize="inherit" />
            {tournament.startDate}
          </span>
          {tournament.location && (
            <span className="tournament-card__detail">
              <PlaceIcon fontSize="inherit" />
              {tournament.location}
            </span>
          )}
          {tournament.competitorsCount != null && (
            <span className="tournament-card__detail">
              <GroupsIcon fontSize="inherit" />
              {tournament.competitorsCount} / {tournament.maxCompetitors}
            </span>
          )}
        </div>
      </Paper>
    </Link>
  )
}
