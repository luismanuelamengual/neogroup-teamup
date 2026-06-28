'use client'

import './index.scss'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { MercadoPagoStatus } from '@/app/(protected)/(account)/(api)/api/mercadopago/status/route'
import { useMercadoPago } from '@/app/(protected)/(account)/hooks/useMercadoPago'
import { useNotifications } from '@/app/hooks/useNotifications'

const CALLBACK_MESSAGES: Record<string, { type: 'success' | 'error'; text: string }> = {
  connected: { type: 'success', text: 'Cuenta de Mercado Pago vinculada correctamente' },
  error: { type: 'error', text: 'No se pudo vincular la cuenta de Mercado Pago. Intentá nuevamente' },
  forbidden: { type: 'error', text: 'Solo los organizadores pueden vincular una cuenta de cobros' },
  unavailable: { type: 'error', text: 'Los pagos no están disponibles en esta plataforma' }
}

export default function MercadoPagoCard() {
  const { getStatus, connect, disconnect } = useMercadoPago()
  const { showSuccessMessage, showErrorMessage } = useNotifications()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<MercadoPagoStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getStatus())
    } catch {
      setStatus(null)
    }

    setLoading(false)
  }, [getStatus])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Surface the OAuth callback result (?mp=...) once, then clean the URL.
  useEffect(() => {
    const result = searchParams.get('mp')

    if (!result) {
      return
    }

    const message = CALLBACK_MESSAGES[result]
    const reason = searchParams.get('reason')

    if (message?.type === 'success') {
      showSuccessMessage(message.text)
    } else if (message) {
      showErrorMessage(reason ? `${message.text} (${reason})` : message.text)
    }

    router.replace('/account')
  }, [router, searchParams, showErrorMessage, showSuccessMessage])

  const handleDisconnect = async () => {
    setWorking(true)

    try {
      await disconnect()
      await loadStatus()
    } catch {
      // error already notified
    }

    setWorking(false)
  }

  return (
    <Paper className="mercadopago-card">
      <Typography variant="h6" component="h2" className="title">
        Cobros (Mercado Pago)
      </Typography>
      <Typography variant="body2" color="text.secondary" className="subtitle">
        Vinculá tu cuenta de Mercado Pago para cobrar las inscripciones de tus torneos de pago. El dinero de cada
        inscripción se acredita en tu cuenta; TeamUp retiene su tasa de servicio automáticamente.
      </Typography>

      {loading ? (
        <Skeleton variant="rounded" height={48} />
      ) : !status?.configured ? (
        <Alert severity="info">Los pagos no están habilitados en esta plataforma todavía.</Alert>
      ) : status.connected ? (
        <div className="connected">
          <Chip icon={<CheckCircleIcon />} color="success" label="Cuenta vinculada" />
          {status.liveMode === false && <Chip color="warning" variant="outlined" label="Modo de prueba" />}
          <div className="spacer" />
          <Button variant="outlined" color="error" onClick={handleDisconnect} disabled={working} loading={working}>
            Desvincular
          </Button>
        </div>
      ) : (
        <Button variant="contained" onClick={connect}>
          Conectar Mercado Pago
        </Button>
      )}
    </Paper>
  )
}
