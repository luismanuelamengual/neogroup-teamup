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
import { FormEvent, useState } from 'react'

interface LoginFormProps {
  callbackUrl: string | null
  verified?: boolean
  passwordReset?: boolean
}

export default function LoginForm({ callbackUrl, verified, passwordReset }: LoginFormProps) {
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
      setError('Email o contraseña incorrectos')
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
        Iniciar sesión
      </Typography>
      <Typography variant="body2" color="text.secondary" className="subtitle">
        Organizá y jugá torneos de tenis y pádel
      </Typography>
      <Button
        variant="outlined"
        fullWidth
        startIcon={<GoogleIcon />}
        onClick={handleGoogleSignIn}
        className="google-button"
      >
        Continuar con Google
      </Button>
      <Divider className="divider">o</Divider>
      <form onSubmit={handleSubmit} className="form">
        {verified && <Alert severity="success">Tu email fue verificado. Ya podés iniciar sesión.</Alert>}
        {passwordReset && <Alert severity="success">Tu contraseña fue actualizada. Ya podés iniciar sesión.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
          autoComplete="email"
        />
        <TextField
          label="Contraseña"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
          autoComplete="current-password"
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading} loading={loading}>
          Ingresar
        </Button>
        <Typography variant="body2" className="forgot-password">
          <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
        </Typography>
      </form>
      <Typography variant="body2" className="footer">
        ¿No tenés cuenta?{' '}
        <Link href={`/register${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}>
          Registrate
        </Link>
      </Typography>
    </div>
  )
}
