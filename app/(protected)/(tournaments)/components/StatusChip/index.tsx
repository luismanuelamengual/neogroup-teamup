'use client'

import Chip from '@mui/material/Chip'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus, TournamentStatusNames } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { isRegistrationOpen } from '@/app/(protected)/(tournaments)/utils/registrations'

const STATUS_COLORS: Record<TournamentStatus, 'default' | 'info' | 'success'> = {
  [TournamentStatus.STAND_BY]: 'info',
  [TournamentStatus.ONGOING]: 'success',
  [TournamentStatus.FINISHED]: 'default'
}

interface StatusChipProps {
  tournament: Pick<TournamentDto, 'status' | 'startInscriptionsDate'>
  size?: 'small' | 'medium'
}

export default function StatusChip({ tournament, size = 'small' }: StatusChipProps) {
  const { status, startInscriptionsDate } = tournament
  const awaitingRegistration = status === TournamentStatus.STAND_BY && !isRegistrationOpen(startInscriptionsDate)

  return (
    <Chip
      label={awaitingRegistration ? 'Nuevo' : TournamentStatusNames[status]}
      color={awaitingRegistration ? 'default' : STATUS_COLORS[status]}
      size={size}
    />
  )
}
