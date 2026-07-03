'use client'

import './index.scss'
import Paper from '@mui/material/Paper'
import MuiSkeleton from '@mui/material/Skeleton'
import classNames from 'classnames'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import Avatar from '@/app/components/Avatar'

const MEDALS: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉'
}

interface RankingCardProps {
  entry: RankingEntryDto
  position: number
}

export default function RankingCard({ entry, position }: RankingCardProps) {
  const medal = MEDALS[position]

  return (
    <Paper className="ranking-card">
      <span className={classNames('position', { medal: !!medal })}>{medal ?? position}</span>
      <div className="body">
        <div className="main">
          <Avatar email={entry.email} name={entry.displayName} size="md" className="avatar" />
          <span className="name">{entry.displayName}</span>
          <div className="points">
            <span className="value">{entry.points}</span>
            <span className="label">pts</span>
          </div>
        </div>
      </div>
    </Paper>
  )
}

export function RankingCardSkeleton() {
  return (
    <Paper className="ranking-card" sx={{ pointerEvents: 'none' }}>
      <MuiSkeleton variant="circular" width={24} height={24} sx={{ transform: 'none' }} />
      <div className="body">
        <div className="main">
          <MuiSkeleton variant="circular" width={40} height={40} sx={{ transform: 'none' }} />
          <MuiSkeleton variant="text" width={160} height={20} sx={{ flex: 1, transform: 'none' }} />
          <MuiSkeleton variant="text" width={48} height={24} sx={{ transform: 'none' }} />
        </div>
      </div>
    </Paper>
  )
}
