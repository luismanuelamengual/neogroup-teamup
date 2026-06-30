import './index.scss'
import { ReactNode } from 'react'

type MessagePanelProps = {
  children: ReactNode
}

export default function MessagePanel({ children }: MessagePanelProps) {
  return <div className="message-panel">{children}</div>
}
