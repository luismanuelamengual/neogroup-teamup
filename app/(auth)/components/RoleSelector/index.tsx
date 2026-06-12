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
import { setRole } from '@/app/(account)/actions/account'
import { UserRoleId, UserRoles } from '@/app/(auth)/models/user'

interface RoleSelectorProps {
  callbackUrl: string | null
}

export default function RoleSelector({ callbackUrl }: RoleSelectorProps) {
  const t = useTranslations('roleSelect')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [selected, setSelected] = useState<UserRoleId | null>(null)
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
      <Typography variant="h5" component="h1" className="role-selector__title">
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="role-selector__subtitle">
        {t('subtitle')}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="role-selector__options">
        <button
          type="button"
          className={`role-selector__option ${
            selected === UserRoles.ORGANIZER ? 'role-selector__option--selected' : ''
          }`}
          onClick={() => setSelected(UserRoles.ORGANIZER)}
        >
          <EmojiEventsIcon className="role-selector__option-icon" />
          <span className="role-selector__option-title">{t('organizerTitle')}</span>
          <span className="role-selector__option-description">{t('organizerDescription')}</span>
        </button>
        <button
          type="button"
          className={`role-selector__option ${selected === UserRoles.PLAYER ? 'role-selector__option--selected' : ''}`}
          onClick={() => setSelected(UserRoles.PLAYER)}
        >
          <SportsTennisIcon className="role-selector__option-icon" />
          <span className="role-selector__option-title">{t('playerTitle')}</span>
          <span className="role-selector__option-description">{t('playerDescription')}</span>
        </button>
      </div>
      <Button variant="contained" fullWidth disabled={!selected || loading} onClick={handleContinue}>
        {t('continue')}
      </Button>
    </div>
  )
}
