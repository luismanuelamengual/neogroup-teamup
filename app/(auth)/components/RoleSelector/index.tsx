'use client'

import './index.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAccount } from '@/app/(protected)/(account)/hooks/useAccount'
import { Role } from '@/app/models/Role'

interface RoleSelectorProps {
  callbackUrl: string | null
  allowedRoles: number[]
}

export default function RoleSelector({ callbackUrl, allowedRoles }: RoleSelectorProps) {
  const { setRole } = useAccount()
  const router = useRouter()
  const [selected, setSelected] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    if (!selected) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await setRole(selected)
    } catch (_error) {
      setLoading(false)
      setError('Algo salió mal. Intentá de nuevo.')

      return
    }

    router.push(callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : '/')
    router.refresh()
  }

  return (
    <div className="role-selector">
      <Typography variant="h5" component="h1" className="title">
        ¿Cómo vas a usar TeamUp?
      </Typography>
      <Typography variant="body2" color="text.secondary" className="subtitle">
        Selecciona el rol que quieres en la plataforma.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="options">
        {allowedRoles.includes(Role.ORGANIZER) && (
          <button
            type="button"
            className={`option ${selected === Role.ORGANIZER ? 'selected' : ''}`}
            onClick={() => setSelected(Role.ORGANIZER)}
          >
            <EmojiEventsIcon className="option-icon" />
            <span className="option-title">Organizador</span>
            <span className="option-description">Creo y administro torneos y ligas</span>
          </button>
        )}
        {allowedRoles.includes(Role.PLAYER) && (
          <button
            type="button"
            className={`option ${selected === Role.PLAYER ? 'selected' : ''}`}
            onClick={() => setSelected(Role.PLAYER)}
          >
            <SportsTennisIcon className="option-icon" />
            <span className="option-title">Jugador</span>
            <span className="option-description">Me inscribo en torneos y cargo mis resultados</span>
          </button>
        )}
      </div>
      <Button variant="contained" fullWidth disabled={!selected || loading} onClick={handleContinue} loading={loading}>
        Continuar
      </Button>
    </div>
  )
}
