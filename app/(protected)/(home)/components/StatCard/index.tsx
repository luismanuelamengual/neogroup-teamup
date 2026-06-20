'use client'

import './index.scss'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import { ReactNode } from 'react'

export type StatAccent = 'primary' | 'amber' | 'info' | 'success' | 'neutral'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: ReactNode
  hint?: string
  accent?: StatAccent
}

export default function StatCard({ icon, label, value, hint, accent = 'primary' }: StatCardProps) {
  return (
    <Paper className={`stat-card accent-${accent}`} elevation={0}>
      <div className="icon">{icon}</div>
      <div className="body">
        <span className="value">{value}</span>
        <span className="label">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
    </Paper>
  )
}

export function StatCardSkeleton() {
  return (
    <Paper className="stat-card accent-neutral" elevation={0}>
      <Skeleton variant="rounded" width={44} height={44} />
      <div className="body">
        <Skeleton variant="text" width={56} height={32} />
        <Skeleton variant="text" width={88} height={18} />
      </div>
    </Paper>
  )
}
