'use client'

import './index.scss'
import { GravatarQuickEditorCore } from '@gravatar-com/quick-editor'
import EditIcon from '@mui/icons-material/Edit'
import Image from 'next/image'
import { useLocale } from 'next-intl'
import { KeyboardEvent, useEffect, useRef, useState } from 'react'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_PX: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80
}

async function computeGravatarHash(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const buffer = new TextEncoder().encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return '?'
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function colorFromInitials(initials: string): { bg: string; fg: string } {
  const palette = [
    '#E53935',
    '#D81B60',
    '#8E24AA',
    '#5E35B1',
    '#3949AB',
    '#1E88E5',
    '#039BE5',
    '#00ACC1',
    '#00897B',
    '#43A047',
    '#7CB342',
    '#F4511E',
    '#FB8C00',
    '#FFB300',
    '#546E7A',
    '#6D4C41',
    '#C0CA33',
    '#D81B60'
  ]
  let hash = 0

  for (const ch of initials) {
    hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  }

  const bg = palette[Math.abs(hash) % palette.length]
  const r = parseInt(bg.slice(1, 3), 16) / 255
  const g = parseInt(bg.slice(3, 5), 16) / 255
  const b = parseInt(bg.slice(5, 7), 16) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  const fg = lum > 0.5 ? '#000' : '#fff'

  return { bg, fg }
}

interface AvatarProps {
  email: string
  name: string
  size?: AvatarSize
  className?: string
  editable?: boolean
  onUpdated?: () => void
}

export default function Avatar({ email, name, size = 'md', className, editable = false, onUpdated }: AvatarProps) {
  const locale = useLocale()
  const px = SIZE_PX[size]
  const initials = getInitials(name)
  const { bg, fg } = colorFromInitials(initials)
  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null)
  const [cacheKey, setCacheKey] = useState(0)
  const quickEditorRef = useRef<GravatarQuickEditorCore | null>(null)

  useEffect(() => {
    if (!email) {
      return
    }

    computeGravatarHash(email).then((hash) => {
      const bust = cacheKey ? `&t=${cacheKey}` : ''

      setGravatarUrl(`https://gravatar.com/avatar/${hash}?s=${px * 2}&d=404${bust}`)
    })
  }, [email, px, cacheKey])

  const handleEditClick = () => {
    quickEditorRef.current ??= new GravatarQuickEditorCore({
      email,
      scope: ['avatars'],
      locale,
      onProfileUpdated: () => {
        setCacheKey(Date.now())
        onUpdated?.()
      }
    })
    quickEditorRef.current.open()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleEditClick()
    }
  }

  const classes = ['app-avatar', `app-avatar--${size}`, editable && 'app-avatar--editable', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{ width: px, height: px }}
      onClick={editable ? handleEditClick : undefined}
      onKeyDown={editable ? handleKeyDown : undefined}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      aria-label={name}
    >
      <div className="app-avatar__initials" style={{ backgroundColor: bg, color: fg, fontSize: Math.round(px * 0.38) }}>
        {initials}
      </div>

      {gravatarUrl && (
        <Image
          className="app-avatar__image"
          src={gravatarUrl}
          alt={name}
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      )}

      {editable && (
        <div className="app-avatar__overlay" aria-hidden="true">
          <EditIcon style={{ fontSize: Math.round(px * 0.4) }} />
        </div>
      )}
    </div>
  )
}
