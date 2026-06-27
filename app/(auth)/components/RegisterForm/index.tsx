'use client'

import './index.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useAuth } from '@/app/(auth)/hooks/useAuth'
import { Role } from '@/app/models/Role'

const ERROR_MESSAGES: Record<string, string> = {
  invalidCredentials: 'Email o contraseña incorrectos',
  invalidEmail: 'El email no es válido',
  passwordTooShort: 'La contraseña debe tener al menos 6 caracteres',
  passwordMismatch: 'Las contraseñas no coinciden',
  missingFields: 'Completá todos los campos obligatorios',
  emailAlreadyRegistered: 'Ya existe una cuenta con ese email',
  invalidRole: 'El rol seleccionado no es válido',
  invalidToken: 'El enlace no es válido o ya fue utilizado.',
  expiredToken: 'El enlace expiró. Solicitá uno nuevo.'
}

interface RegisterFormProps {
  callbackUrl: string | null
  allowedRegistrationRoles: number[]
}

export default function RegisterForm({ callbackUrl, allowedRegistrationRoles }: RegisterFormProps) {
  const { registerUser } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState<Role>(Role.PLAYER)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await registerUser({ email, password, firstName, lastName, phoneNumber, roleId })
    } catch (requestError) {
      setLoading(false)
      const key = (requestError as Error).message

      setError(ERROR_MESSAGES[key] ?? 'Algo salió mal. Intentá de nuevo.')

      return
    }

    setLoading(false)
    setRegistered(true)
  }

  if (registered) {
    return (
      <div className="register-form">
        <Typography variant="h5" component="h1" className="title">
          Verificá tu email
        </Typography>
        <Alert severity="success" sx={{ mt: 2 }}>
          Te enviamos un enlace de verificación a {email}. Revisá tu bandeja de entrada y hacé clic para activar tu
          cuenta.
        </Alert>
        <Typography variant="body2" className="footer" sx={{ mt: 2 }}>
          ¿Ya tenés cuenta?{' '}
          <Link href={`/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}>Ingresar</Link>
        </Typography>
      </div>
    )
  }

  return (
    <div className="register-form">
      <Typography variant="h5" component="h1" className="title">
        Crear cuenta
      </Typography>
      <form onSubmit={handleSubmit} className="form">
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Nombre"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Apellido"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Teléfono"
          type="tel"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          fullWidth
          autoComplete="tel"
        />
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
          autoComplete="new-password"
        />
        {!!allowedRegistrationRoles && allowedRegistrationRoles.length > 0 && (
          <div className="role">
            <Typography variant="body2" color="text.secondary">
              Quiero usar TeamUp como
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={roleId}
              onChange={(_, value: Role | null) => {
                if (value) {
                  setRoleId(value)
                }
              }}
            >
              {allowedRegistrationRoles.includes(Role.PLAYER) && (
                <ToggleButton value={Role.PLAYER}>
                  <SportsTennisIcon fontSize="small" sx={{ mr: 1 }} />
                  Jugador
                </ToggleButton>
              )}
              {allowedRegistrationRoles.includes(Role.ORGANIZER) && (
                <ToggleButton value={Role.ORGANIZER}>
                  <EmojiEventsIcon fontSize="small" sx={{ mr: 1 }} />
                  Organizador
                </ToggleButton>
              )}
            </ToggleButtonGroup>
          </div>
        )}
        <Button type="submit" variant="contained" fullWidth loading={loading} disabled={loading}>
          Crear cuenta
        </Button>
      </form>
      <Typography variant="body2" className="footer">
        ¿Ya tenés cuenta?{' '}
        <Link href={`/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}>Ingresar</Link>
      </Typography>
    </div>
  )
}
