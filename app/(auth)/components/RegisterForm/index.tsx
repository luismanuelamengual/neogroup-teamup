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
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { registerUser } from '@/app/(auth)/actions/auth'
import { UserRoleId, UserRoles } from '@/app/(auth)/models/user'

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
  const [roleId, setRoleId] = useState<UserRoleId>(UserRoles.PLAYER)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const targetUrl = callbackUrl ? `/?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await registerUser({ email, password, firstName, lastName, roleId })
    } catch (requestError) {
      setLoading(false)
      setError(t(`errors.${(requestError as Error).message}`))

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
        <div className="register-form__role">
          <Typography variant="body2" color="text.secondary">
            {t('roleLabel')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={roleId}
            onChange={(_, value: UserRoleId | null) => {
              if (value) {
                setRoleId(value)
              }
            }}
          >
            <ToggleButton value={UserRoles.PLAYER}>
              <SportsTennisIcon fontSize="small" sx={{ mr: 1 }} />
              {t('rolePlayer')}
            </ToggleButton>
            <ToggleButton value={UserRoles.ORGANIZER}>
              <EmojiEventsIcon fontSize="small" sx={{ mr: 1 }} />
              {t('roleOrganizer')}
            </ToggleButton>
          </ToggleButtonGroup>
        </div>
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
