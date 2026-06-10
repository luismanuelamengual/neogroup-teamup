'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

import { registerUser } from '@/app/_actions/auth.actions'

import './RegisterForm.styles.scss'

interface RegisterFormProps {
  callbackUrl: string | null
}

export default function RegisterForm({ callbackUrl }: RegisterFormProps) {
  const t = useTranslations('auth')
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const targetUrl = callbackUrl ? `/?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const result = await registerUser({ email, password, firstName, lastName })

    if (!result.success) {
      setLoading(false)
      setError(t(`errors.${result.error ?? 'missingFields'}`))

      return
    }

    await signIn('credentials', {
      email,
      password,
      redirect: false
    })
    router.push(targetUrl)
    router.refresh()
  }

  return (
    <div className="register-form">
      <Typography variant="h5" component="h1" className="register-form__title">
        {t('registerTitle')}
      </Typography>
      <form onSubmit={handleSubmit} className="register-form__form">
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
          label={t('email')}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
          autoComplete="email"
        />
        <TextField
          label={t('password')}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading}>
          {t('createAccount')}
        </Button>
      </form>
      <Typography variant="body2" className="register-form__footer">
        {t('haveAccount')}{' '}
        <Link href={`/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}>
          {t('signIn')}
        </Link>
      </Typography>
    </div>
  )
}
