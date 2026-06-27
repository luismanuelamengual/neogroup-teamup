'use client'

import Chip from '@mui/material/Chip'
import { TournamentStatus, TournamentStatusNames } from '@/app/(protected)/(tournaments)/models/TournamentStatus'

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
  return <Chip label={TournamentStatusNames[status]} color={STATUS_COLORS[status]} size={size} />
}
