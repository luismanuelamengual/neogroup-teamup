import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { confirmPaymentFromWebhook } from '@/app/(protected)/(tournaments)/services/payments'

/**
 * POST /api/mercadopago/webhook — Mercado Pago payment notifications (IPN/Webhooks).
 *
 * Public endpoint. The preference's notification_url carries `?ref=<paymentId>`
 * (our payment row id) so we can resolve the organizer/token without knowing the
 * collector up front. We then fetch the real payment from Mercado Pago, verify
 * its external_reference and confirm (register the competitor) or refund.
 *
 * Always returns 200 for handled/ignored notifications; returns 500 only on
 * transient failures so Mercado Pago retries.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  const refParam = url.searchParams.get('ref')
  const rawBody = await request.text()

  if (!verifySignature(request, url)) {
    // eslint-disable-next-line no-console
    console.warn('[mercadopago/webhook] Invalid signature, ignoring notification')

    return NextResponse.json({ ignored: true }, { status: 200 })
  }

  let body: { type?: string; topic?: string; action?: string; data?: { id?: string | number } } = {}

  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    body = {}
  }

  const type = body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic')

  // Only payment notifications are actionable here.
  if (type !== 'payment') {
    return NextResponse.json({ ignored: true }, { status: 200 })
  }

  const mpPaymentId =
    body.data?.id != null
      ? String(body.data.id)
      : (url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? null)
  const paymentRowId = refParam ? Number(refParam) : NaN

  if (!mpPaymentId || Number.isNaN(paymentRowId)) {
    return NextResponse.json({ ignored: true }, { status: 200 })
  }

  try {
    await confirmPaymentFromWebhook(paymentRowId, mpPaymentId)

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[mercadopago/webhook] Error processing notification:', error)

    return NextResponse.json({ error: true }, { status: 500 })
  }
}

/**
 * Validates the `x-signature` header per Mercado Pago's spec when
 * MP_WEBHOOK_SECRET is configured. Skipped (returns true) when no secret is set.
 */
function verifySignature(request: NextRequest, url: URL): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET

  if (!secret) {
    return true
  }

  const signature = request.headers.get('x-signature')
  const requestId = request.headers.get('x-request-id') ?? ''
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? ''

  if (!signature) {
    return false
  }

  const parts = Object.fromEntries(
    signature.split(',').map((part) => part.split('=').map((value) => value.trim()))
  ) as { ts?: string; v1?: string }

  if (!parts.ts || !parts.v1) {
    return false
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')

  return expected === parts.v1
}
