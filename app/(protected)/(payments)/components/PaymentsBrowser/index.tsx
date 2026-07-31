'use client'

import './index.scss'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PaymentIcon from '@mui/icons-material/Payment'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePayments } from '@/app/(protected)/(payments)/hooks/usePayments'
import { PaymentStatus } from '@/app/(protected)/(payments)/models/PaymentStatus'
import { PendingPaymentsDto } from '@/app/(protected)/(payments)/models/PendingPaymentsDto'
import { formatMoney } from '@/app/(protected)/(tournaments)/utils/money'
import { useNotifications } from '@/app/hooks/useNotifications'

/** How many times the page polls the settlement status after the checkout. */
const CONFIRMATION_ATTEMPTS = 6
const CONFIRMATION_INTERVAL_MS = 2500

/**
 * Service fee settlement screen: every tournament of the organization that
 * already took place and has not been paid to TeamUp yet, and a single checkout
 * that clears all of them.
 */
export default function PaymentsBrowser() {
  const { getPendingPayments, payPendingTournaments, getServicePaymentStatus } = usePayments()
  const { showErrorMessage, showSuccessMessage, showWarningMessage } = useNotifications()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, setPending] = useState<PendingPaymentsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const returnHandled = useRef(false)
  const load = useCallback(async () => {
    setPending(await getPendingPayments())
    setLoading(false)
  }, [getPendingPayments])

  useEffect(() => {
    load()
  }, [load])

  // Handle the return from the Mercado Pago checkout
  // (?payment=success|failure|pending&ref=<settlementId>): the tournaments are
  // only marked as paid by the webhook, so on success the status is polled until
  // it is confirmed and the list is refreshed.
  useEffect(() => {
    const result = searchParams.get('payment')

    if (!result || returnHandled.current) {
      return
    }

    returnHandled.current = true

    const paymentId = Number(searchParams.get('ref'))

    router.replace('/payments')

    if (result === 'failure') {
      showErrorMessage('El pago no se completó. Los torneos siguen pendientes')

      return
    }

    if (result === 'pending') {
      showWarningMessage('Tu pago está pendiente de acreditación. Los torneos se darán por pagados al confirmarse')

      return
    }

    if (result !== 'success' || !Number.isInteger(paymentId)) {
      return
    }

    showSuccessMessage('Pago recibido. Confirmando...')

    let attempts = 0

    const poll = async () => {
      attempts += 1

      const status = await getServicePaymentStatus(paymentId)

      if (status?.status === PaymentStatus.APPROVED) {
        showSuccessMessage('¡Pago confirmado!')
        await load()

        return
      }

      if (status?.status === PaymentStatus.REJECTED) {
        showErrorMessage('El pago fue rechazado. Los torneos siguen pendientes')

        return
      }

      if (attempts < CONFIRMATION_ATTEMPTS) {
        setTimeout(poll, CONFIRMATION_INTERVAL_MS)
      } else {
        showWarningMessage('Estamos confirmando tu pago. Los torneos se actualizarán en unos instantes')
      }
    }

    poll()
  }, [searchParams, router, getServicePaymentStatus, load, showErrorMessage, showSuccessMessage, showWarningMessage])

  const handlePay = async () => {
    setPaying(true)

    try {
      await payPendingTournaments()
    } catch {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="payments-browser">
        <Skeleton variant="rounded" height={260} />
      </div>
    )
  }

  const tournaments = pending?.tournaments ?? []

  if (tournaments.length === 0) {
    return (
      <div className="payments-browser">
        <Paper className="empty" elevation={0}>
          <CheckCircleIcon className="empty-icon" />
          <Typography variant="h6">No tenés pagos pendientes</Typography>
          <Typography variant="body2" color="text.secondary">
            Acá vas a ver los torneos con inscripción paga que ya comenzaron y todavía no abonaste.
          </Typography>
        </Paper>
      </div>
    )
  }

  const currency = pending?.currency ?? 'ARS'
  const feePercentage = pending?.serviceFeePercentage ?? 0

  return (
    <div className="payments-browser">
      {(pending?.overdueCount ?? 0) > 0 && (
        <Alert severity="warning">
          Tenés {pending!.overdueCount} {pending!.overdueCount === 1 ? 'torneo' : 'torneos'} con más de un mes sin
          abonar. No vas a poder crear nuevos torneos hasta regularizarlo.
        </Alert>
      )}

      <Paper className="detail" elevation={0}>
        <Table size="small" className="detail-table">
          <TableHead>
            <TableRow>
              <TableCell>Torneo</TableCell>
              <TableCell align="right">Inscriptos</TableCell>
              <TableCell align="right">Inscripción</TableCell>
              <TableCell align="right">Recaudado</TableCell>
              <TableCell align="right">Servicio ({feePercentage}%)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tournaments.map((tournament) => (
              <TableRow key={tournament.id}>
                <TableCell>
                  <div className="tournament-cell">
                    <span className="tournament-name">{tournament.name}</span>
                    <span className="tournament-date">
                      {tournament.startDate}
                      {tournament.overdue && <Chip size="small" color="warning" label="Vencido" />}
                    </span>
                  </div>
                </TableCell>
                <TableCell align="right">{tournament.competitorsCount}</TableCell>
                <TableCell align="right">$ {formatMoney(tournament.entryFee, currency)}</TableCell>
                <TableCell align="right">$ {formatMoney(tournament.grossAmount, currency)}</TableCell>
                <TableCell align="right" className="amount">
                  $ {formatMoney(tournament.amount, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary" className="note">
          Se cobra sobre el total de inscriptos de cada torneo, tomado al momento de comenzar.
        </Typography>
      </Paper>

      <Paper className="total" elevation={0}>
        <div className="total-text">
          <Typography variant="body2" color="text.secondary">
            Total a pagar
          </Typography>
          <Typography variant="h5" className="total-amount">
            $ {formatMoney(pending?.amount ?? 0, currency)}
          </Typography>
        </div>
        <Button
          variant="contained"
          size="large"
          startIcon={<PaymentIcon />}
          onClick={handlePay}
          disabled={paying}
          className="total-action"
        >
          Pagar con Mercado Pago
        </Button>
      </Paper>
    </div>
  )
}
