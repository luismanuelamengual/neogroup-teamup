'use client'

import './index.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Role } from '@/app/(auth)/models/Role'
import { setRole } from '@/app/(protected)/(account)/actions/account'

interface RoleSelectorProps {
  callbackUrl: string | null
}

export default function RoleSelector({ callbackUrl }: RoleSelectorProps) {
  const t = useTranslations('roleSelect')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [selected, setSelected] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    if (!selected) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await setRole(selected)
    } catch (_error) {
      setLoading(false)
      setError(tCommon('genericError'))

      return
    }

    router.push(callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : '/')
    router.refresh()
  }

  return (
    <div className="role-selector">
      <Typography variant="h5" component="h1" className="title">
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="subtitle">
        {t('subtitle')}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="options">
        <button
          type="button"
          className={`option ${selected === Role.ORGANIZER ? 'selected' : ''}`}
          onClick={() => setSelected(Role.ORGANIZER)}
        >
          <EmojiEventsIcon className="option-icon" />
          <span className="option-title">{t('organizerTitle')}</span>
          <span className="option-description">{t('organizerDescription')}</span>
        </button>
        <button
          type="button"
          className={`option ${selected === Role.PLAYER ? 'selected' : ''}`}
          onClick={() => setSelected(Role.PLAYER)}
        >
          <SportsTennisIcon className="option-icon" />
          <span className="option-title">{t('playerTitle')}</span>
          <span className="option-description">{t('playerDescription')}</span>
        </button>
      </div>
      <Button variant="contained" fullWidth disabled={!selected || loading} onClick={handleContinue}>
        {t('continue')}
      </Button>
    </div>
  )
}
