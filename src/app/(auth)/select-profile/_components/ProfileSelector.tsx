'use client'

import './ProfileSelector.styles.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { setProfile } from '@/app/_actions/account.actions'
import { Profile } from '@/app/_models/types'

interface ProfileSelectorProps {
  callbackUrl: string | null
}

export default function ProfileSelector({ callbackUrl }: ProfileSelectorProps) {
  const t = useTranslations('profileSelect')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [selected, setSelected] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    if (!selected) {
      return
    }

    setLoading(true)
    setError(null)

    const result = await setProfile(selected)

    if (!result.success) {
      setLoading(false)
      setError(tCommon('genericError'))

      return
    }

    router.push(callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : '/')
    router.refresh()
  }

  return (
    <div className="profile-selector">
      <Typography variant="h5" component="h1" className="profile-selector__title">
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="profile-selector__subtitle">
        {t('subtitle')}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="profile-selector__options">
        <button
          type="button"
          className={`profile-selector__option ${selected === 'organizer' ? 'profile-selector__option--selected' : ''}`}
          onClick={() => setSelected('organizer')}
        >
          <EmojiEventsIcon className="profile-selector__option-icon" />
          <span className="profile-selector__option-title">{t('organizerTitle')}</span>
          <span className="profile-selector__option-description">{t('organizerDescription')}</span>
        </button>
        <button
          type="button"
          className={`profile-selector__option ${selected === 'player' ? 'profile-selector__option--selected' : ''}`}
          onClick={() => setSelected('player')}
        >
          <SportsTennisIcon className="profile-selector__option-icon" />
          <span className="profile-selector__option-title">{t('playerTitle')}</span>
          <span className="profile-selector__option-description">{t('playerDescription')}</span>
        </button>
      </div>
      <Button variant="contained" fullWidth disabled={!selected || loading} onClick={handleContinue}>
        {t('continue')}
      </Button>
    </div>
  )
}
