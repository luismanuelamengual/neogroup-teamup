'use client'

import './AccountForm.styles.scss'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { updateAccount } from '@/app/_actions/account'

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
  const [firstName, setFirstName] = useState(props.firstName)
  const [lastName, setLastName] = useState(props.lastName)
  const [nickname, setNickname] = useState(props.nickname)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setSaved(false)
    setError(null)

    const result = await updateAccount({ firstName, lastName, nickname })

    setLoading(false)

    if (!result.success) {
      setError(tCommon('genericError'))

      return
    }

    setSaved(true)
    router.refresh()
  }

  return (
    <Paper className="account-form">
      <Typography variant="h5" component="h1" className="account-form__title">
        {t('title')}
      </Typography>
      <div className="account-form__avatar-section">
        <Avatar src={props.avatarUrl} alt={firstName} className="account-form__avatar" />
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
        <Button type="submit" variant="contained" disabled={loading}>
          {tCommon('save')}
        </Button>
      </form>
    </Paper>
  )
}
