'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { useRequests } from '@/app/hooks/useRequests'

const ERROR_MESSAGES: Record<string, string> = {
  passwordMismatch: 'Las contraseñas no coinciden',
  invalidToken: 'El enlace no es válido o ya fue utilizado.',
  expiredToken: 'El enlace expiró. Solicitá uno nuevo.'
}

interface ResetPasswordFormProps {
  token: string
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
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
      setError('Las contraseñas no coinciden')

      return
    }

    setLoading(true)

    try {
      await executeRequest('/resetPassword', { token, password }, false)
      router.push('/login?passwordReset=1')
    } catch (requestError) {
      const key = (requestError as Error).message

      setError(ERROR_MESSAGES[key] ?? 'Algo salió mal. Intentá de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="login-form">
      <Typography variant="h5" component="h1" className="title">
        Nueva contraseña
      </Typography>
      <form onSubmit={handleSubmit} className="form">
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Nueva contraseña"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />
        <TextField
          label="Confirmar contraseña"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />
        <Button type="submit" variant="contained" fullWidth disabled={loading} loading={loading}>
          Guardar contraseña
        </Button>
      </form>
    </div>
  )
}
