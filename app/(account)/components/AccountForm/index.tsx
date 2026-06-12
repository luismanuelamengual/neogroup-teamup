'use client'

import './index.scss'
import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ChangeEvent, FormEvent, useState } from 'react'
import { setLocale, updateAccount } from '@/app/(account)/actions/account'

const GRAVATAR_EDIT_URL = 'https://gravatar.com/profile/avatars'

interface AccountFormProps {
  email: string
  firstName: string
  lastName: string
  nickname: string
  avatarUrl: string
}

export default function AccountForm(props: AccountFormProps) {
  const t = useTranslations('account')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const locale = useLocale()
  const [firstName, setFirstName] = useState(props.firstName)
  const [lastName, setLastName] = useState(props.lastName)
  const [nickname, setNickname] = useState(props.nickname)
  const [language, setLanguage] = useState(locale)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const languages = [
    { value: 'es', label: t('spanish'), flag: '🇪🇸' },
    { value: 'en', label: t('english'), flag: '🇬🇧' }
  ]

  const handleLanguageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const newLocale = event.target.value

    setLanguage(newLocale)
    setError(null)

    try {
      await setLocale(newLocale)
    } catch (_error) {
      setLanguage(locale)
      setError(tCommon('genericError'))

      return
    }

    router.refresh()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setSaved(false)
    setError(null)

    try {
      await updateAccount({ firstName, lastName, nickname })
    } catch (_error) {
      setLoading(false)
      setError(tCommon('genericError'))

      return
    }

    setLoading(false)
    setSaved(true)
    router.refresh()
  }

  return (
    <Paper className="account-form">
      <Typography variant="h5" component="h1" className="account-form__title">
        {t('title')}
      </Typography>
      <div className="account-form__avatar-section">
        <Tooltip title={t('avatarEdit')}>
          <ButtonBase
            component="a"
            href={GRAVATAR_EDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="account-form__avatar-button"
            aria-label={t('avatarEdit')}
            focusRipple
          >
            <Avatar src={props.avatarUrl} alt={firstName} className="account-form__avatar" />
            <span className="account-form__avatar-overlay">
              <EditIcon fontSize="small" />
            </span>
          </ButtonBase>
        </Tooltip>
        <div className="account-form__avatar-info">
          <Typography variant="body2">{props.email}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('avatarHelp')}
          </Typography>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="account-form__form">
        {saved && <Alert severity="success">{t('saved')}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t('firstName')}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label={t('lastName')}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label={t('nickname')}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          helperText={t('nicknameHelp')}
          fullWidth
        />
        <TextField select label={t('language')} value={language} onChange={handleLanguageChange} fullWidth>
          {languages.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              <span className="account-form__language-option">
                <span className="account-form__language-flag" aria-hidden="true">
                  {option.flag}
                </span>
                {option.label}
              </span>
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" disabled={loading}>
          {tCommon('save')}
        </Button>
      </form>
    </Paper>
  )
}
