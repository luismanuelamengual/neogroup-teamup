'use client'

import Chip from '@mui/material/Chip'
import { useTranslations } from 'next-intl'
import { TournamentStatus } from '@/app/(tournaments)/models/types'

const STATUS_COLORS: Record<TournamentStatus, 'default' | 'info' | 'success'> = {
  stand_by: 'info',
  ongoing: 'success',
  finished: 'default'
}

export default function StatusChip({
  status,
  size = 'small'
}: {
  status: TournamentStatus
  size?: 'small' | 'medium'
}) {
  const t = useTranslations('tournaments.status')

  return <Chip label={t(status)} color={STATUS_COLORS[status]} size={size} />
}
