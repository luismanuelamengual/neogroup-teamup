'use client'

import './index.scss'
import GoogleIcon from '@mui/icons-material/Google'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'

interface LoginFormProps {
  callbackUrl: string | null
  verified?: boolean
}

export default function LoginForm({ callbackUrl, verified }: LoginFormProps) {
  const t = useTranslations('auth')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const targetUrl = callbackUrl ? `/?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const response = await signIn('credentials', {
      email,
      password,
      redirect: false
    })

    if (response?.error) {
      setError(t('errors.invalidCredentials'))
      setLoading(false)

      return
    }

    router.push(targetUrl)
    router.refresh()
  }

  const handleGoogleSignIn = () => {
    signIn('google', { redirectTo: targetUrl })
  }

  return (
    <div className="login-form">
      <Image src="/logo.png" alt="TeamUp" width={220} height={35} className="logo" priority />
      <Typography variant="h5" component="h1" className="title">
        {t('signInTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="subtitle">
        {t('signInSubtitle')}
      </Typography>
      <Button
        variant="outlined"
        fullWidth
        startIcon={<GoogleIcon />}
        onClick={handleGoogleSignIn}
        className="google-button"
      >
        {t('signInWithGoogle')}
      </Button>
      <Divider className="divider">{t('or')}</Divider>
      <form onSubmit={handleSubmit} className="form">
        {verified && <Alert severity="success">{t('verifyEmailSuccess')}</Alert>}
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
        <TextField
          label={t('password')}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
          autoComplete="current-password"
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading} loading={loading}>
          {t('signIn')}
        </Button>
      </form>
      <Typography variant="body2" className="footer">
        {t('noAccount')}{' '}
        <Link href={`/register${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}>
          {t('register')}
        </Link>
      </Typography>
    </div>
  )
}
