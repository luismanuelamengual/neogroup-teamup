'use client'

import './index.scss'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'

interface CompetitorsListProps {
  tournament: TournamentDto
  category?: string
}

export default function CompetitorsList({ tournament, category }: CompetitorsListProps) {
  const tOrganizer = useTranslations('organizer')
  const competitors = useMemo(() => {
    const all = tournament.competitors ?? []

    if (category != null) {
      return all.filter((c) => c.category === category)
    }

    return all
  }, [tournament, category])

  if (competitors.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {tOrganizer('manage.noCompetitors')}
      </Typography>
    )
  }

  return (
    <div className="competitors-list">
      {competitors.map((competitor) => (
        <Chip key={competitor.id} label={competitor.displayName} variant="outlined" />
      ))}
    </div>
  )
}
