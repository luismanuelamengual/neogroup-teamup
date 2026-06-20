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
const PALETTE = [
  'E53935',
  'D81B60',
  '8E24AA',
  '5E35B1',
  '3949AB',
  '1E88E5',
  '039BE5',
  '00ACC1',
  '00897B',
  '43A047',
  '7CB342',
  'F4511E',
  'FB8C00',
  'FFB300',
  '546E7A',
  '6D4C41'
]

async function computeGravatarHash(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const buffer = new TextEncoder().encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function colorFromName(name: string): string {
  let hash = 0

  for (const ch of name.trim()) {
    hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  }

  return PALETTE[Math.abs(hash) % PALETTE.length]
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
  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null)
  const [cacheKey, setCacheKey] = useState(0)
  const quickEditorRef = useRef<GravatarQuickEditorCore | null>(null)

  useEffect(() => {
    if (!email) {
      return
    }

    const color = colorFromName(name)
    const cleanName = encodeURIComponent(name).replace(/%20/g, '+')
    const size = px * 2
    const uiAvatarUrl = `https://ui-avatars.com/api/${cleanName}/${size}/${color}/fff?bold=true&rounded=true`
    const bust = cacheKey ? `&t=${cacheKey}` : ''

    computeGravatarHash(email).then((hash) => {
      setGravatarUrl(`https://gravatar.com/avatar/${hash}?s=${size}&d=${encodeURIComponent(uiAvatarUrl)}${bust}`)
    })
  }, [email, name, px, cacheKey])

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
      {gravatarUrl && (
        <Image width={px * 2} height={px * 2} className="app-avatar__image" src={gravatarUrl} alt={name} />
      )}

      {editable && (
        <div className="app-avatar__overlay" aria-hidden="true">
          <EditIcon style={{ fontSize: Math.round(px * 0.4) }} />
        </div>
      )}
    </div>
  )
}
