import { ReactNode } from 'react'

import './auth-layout.styles.scss'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__card">{children}</div>
    </div>
  )
}
