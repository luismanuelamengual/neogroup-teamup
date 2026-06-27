'use client'

import Chip from '@mui/material/Chip'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentStatusNames } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TOURNAMENT_STATUS_LABELS } from '@/app/(protected)/(tournaments)/utils/labels'

const STATUS_COLORS: Record<TournamentStatus, 'default' | 'info' | 'success'> = {
  [TournamentStatus.STAND_BY]: 'info',
  [TournamentStatus.ONGOING]: 'success',
  [TournamentStatus.FINISHED]: 'default'
}

export default function StatusChip({
  status,
  size = 'small'
}: {
  status: TournamentStatus
  size?: 'small' | 'medium'
}) {
  return (
    <Chip
      label={TOURNAMENT_STATUS_LABELS[TournamentStatusNames[status]] ?? TournamentStatusNames[status]}
      color={STATUS_COLORS[status]}
      size={size}
    />
  )
}
