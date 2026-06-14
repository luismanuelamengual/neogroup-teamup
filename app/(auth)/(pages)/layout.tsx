import './layout.scss'
import { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="card">{children}</div>
    </div>
  )
}
