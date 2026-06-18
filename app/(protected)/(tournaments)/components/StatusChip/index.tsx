'use client'

import Chip from '@mui/material/Chip'
import { useTranslations } from 'next-intl'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TOURNAMENT_STATUS_KEYS } from '@/app/(protected)/(tournaments)/utils/labels'

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
  const t = useTranslations('tournaments.status')

  return <Chip label={t(TOURNAMENT_STATUS_KEYS[status])} color={STATUS_COLORS[status]} size={size} />
}
