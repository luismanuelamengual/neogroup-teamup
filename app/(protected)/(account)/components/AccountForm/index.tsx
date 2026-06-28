'use client'

import './index.scss'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { useAccount } from '@/app/(protected)/(account)/hooks/useAccount'
import Avatar from '@/app/components/Avatar'

interface AccountFormProps {
  email: string
  firstName: string
  lastName: string
  nickname: string
  phoneNumber: string
}

export default function AccountForm(props: AccountFormProps) {
  const { updateAccount } = useAccount()
  const router = useRouter()
  const [firstName, setFirstName] = useState(props.firstName)
  const [lastName, setLastName] = useState(props.lastName)
  const [nickname, setNickname] = useState(props.nickname)
  const [phoneNumber, setPhoneNumber] = useState(props.phoneNumber)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)

    try {
      await updateAccount({ firstName, lastName, nickname, phoneNumber })
    } catch (e) {}

    setLoading(false)
    router.refresh()
  }

  return (
    <Paper className="account-form">
      <Typography variant="h5" component="h1" className="title">
        Mi cuenta
      </Typography>
      <div className="avatar-section">
        <Tooltip title="Editar avatar en Gravatar">
          <Avatar
            email={props.email}
            name={[firstName, lastName].filter(Boolean).join(' ') || props.email}
            size="lg"
            editable
            onUpdated={() => router.refresh()}
          />
        </Tooltip>
        <div className="avatar-info">
          <Typography variant="body2">{props.email}</Typography>
          <Typography variant="caption" color="text.secondary">
            Tu avatar se obtiene de Gravatar usando tu email. Hacé click en él para editarlo
          </Typography>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="form">
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
          label="Apodo"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          helperText="Si lo establecés, se muestra siempre en lugar de tu nombre"
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
        <Button type="submit" variant="contained" disabled={loading} loading={loading}>
          Guardar
        </Button>
      </form>
    </Paper>
  )
}
