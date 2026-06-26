'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { useRequests } from '@/app/hooks/useRequests'

export default function ForgotPasswordForm() {
  const t = useTranslations('auth')
  const executeRequest = useRequests()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await executeRequest('/forgotPassword', { email }, false)
    } catch {
      // Silently ignore errors to avoid user enumeration
    }

    setLoading(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="login-form">
        <Typography variant="h5" component="h1" className="title">
          {t('forgotPasswordTitle')}
        </Typography>
        <Alert severity="success">{t('forgotPasswordSent', { email })}</Alert>
        <Typography variant="body2" className="footer">
          <Link href="/login">{t('signIn')}</Link>
        </Typography>
      </div>
    )
  }

  return (
    <div className="login-form">
      <Typography variant="h5" component="h1" className="title">
        {t('forgotPasswordTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="subtitle">
        {t('forgotPasswordSubtitle')}
      </Typography>
      <form onSubmit={handleSubmit} className="form">
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t('email')}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
          autoComplete="email"
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading} loading={loading}>
          {t('forgotPasswordSubmit')}
        </Button>
      </form>
      <Typography variant="body2" className="footer">
        <Link href="/login">{t('signIn')}</Link>
      </Typography>
    </div>
  )
}
