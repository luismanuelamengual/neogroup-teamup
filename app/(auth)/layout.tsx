import './layout.scss'
import { ReactNode } from 'react'

/**
 * Shared layout for every non authenticated page
 */
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="card">{children}</div>
    </div>
  )
}
