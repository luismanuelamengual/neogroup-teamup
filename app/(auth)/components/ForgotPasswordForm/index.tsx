'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRequests } from '@/app/hooks/useRequests'

export default function ForgotPasswordForm() {
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
          Recuperar contraseña
        </Typography>
        <Alert severity="success">
          Si existe una cuenta asociada a {email}, recibirás un correo con instrucciones para restablecer tu contraseña.
        </Alert>
        <Typography variant="body2" className="footer">
          <Link href="/login">Ingresar</Link>
        </Typography>
      </div>
    )
  }

  return (
    <div className="login-form">
      <Typography variant="h5" component="h1" className="title">
        Recuperar contraseña
      </Typography>
      <Typography variant="body2" color="text.secondary" className="subtitle">
        Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.
      </Typography>
      <form onSubmit={handleSubmit} className="form">
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
        <Button type="submit" variant="contained" fullWidth disabled={loading} loading={loading}>
          Enviar enlace
        </Button>
      </form>
      <Typography variant="body2" className="footer">
        <Link href="/login">Ingresar</Link>
      </Typography>
    </div>
  )
}
