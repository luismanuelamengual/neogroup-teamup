import './index.scss'
import { ReactNode } from 'react'

interface StatsProps {
  children: ReactNode
}

export default function StatCard({ children }: StatsProps) {
  return <div className="stats">{children}</div>
}
