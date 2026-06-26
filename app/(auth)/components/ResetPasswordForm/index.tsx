'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { useRequests } from '@/app/hooks/useRequests'

interface ResetPasswordFormProps {
  token: string
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations('auth')
  const executeRequest = useRequests()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError(t('errors.passwordMismatch'))

      return
    }

    setLoading(true)

    try {
      await executeRequest('/resetPassword', { token, password }, false)
      router.push('/login?passwordReset=1')
    } catch (requestError) {
      setError(t(`errors.${(requestError as Error).message}`))
      setLoading(false)
    }
  }

  return (
    <div className="login-form">
      <Typography variant="h5" component="h1" className="title">
        {t('resetPasswordTitle')}
      </Typography>
      <form onSubmit={handleSubmit} className="form">
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t('newPassword')}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />
        <TextField
          label={t('confirmPassword')}
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading} loading={loading}>
          {t('resetPasswordSubmit')}
        </Button>
      </form>
    </div>
  )
}
