'use client'

import './index.scss'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import CompetitorInfoModal from '@/app/(protected)/(tournaments)/components/CompetitorInfoModal'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

interface CompetitorsListProps {
  tournament: TournamentDto
  category?: number
}

export default function CompetitorsList({ tournament, category }: CompetitorsListProps) {
  const [selectedCompetitors, setSelectedCompetitors] = useState<CompetitorDto[]>([])
  const competitors = useMemo(() => {
    const all = tournament.competitors ?? []

    if (category != null) {
      return all.filter((c) => c.tournamentCategoryId === category)
    }

    return all
  }, [tournament, category])

  if (competitors.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Aún no hay inscriptos
      </Typography>
    )
  }

  return (
    <>
      <div className="competitors-list">
        {competitors.map((competitor) => (
          <Chip
            key={competitor.id}
            label={
              competitor.seedNumber != null
                ? `[${competitor.seedNumber}] ${competitor.displayName}`
                : competitor.displayName
            }
            variant="outlined"
            onClick={() => setSelectedCompetitors([competitor])}
            className="clickable"
          />
        ))}
      </div>
      <CompetitorInfoModal
        open={selectedCompetitors.length > 0}
        competitors={selectedCompetitors}
        onClose={() => setSelectedCompetitors([])}
      />
    </>
  )
}
