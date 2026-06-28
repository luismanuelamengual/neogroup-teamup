import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/services/auth'
import { Role } from '@/app/models/Role'
import { getAuthorizationUrl, isMercadoPagoConfigured } from '@/app/services/mercadopago'
import { getCanonicalRedirectUri, isAllowedReturnOrigin, signOAuthState } from '@/app/services/mercadopago-oauth'

/**
 * GET /api/mercadopago/connect — starts the Mercado Pago OAuth flow.
 *
 * Only organizer-role users can connect an account. The `state` is HMAC-signed
 * and carries the user id and the originating subdomain (return origin), so the
 * single canonical callback can authenticate the request without a session
 * cookie and redirect the organizer back to their subdomain.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = new URL(request.url).origin

  if (!isMercadoPagoConfigured()) {
    return NextResponse.redirect(new URL('/account?mp=unavailable', origin))
  }

  const session = await auth()
  const userId = session?.user?.id ? Number(session.user.id) : null

  if (!userId) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  if (session?.user?.roleId !== Role.ORGANIZER) {
    return NextResponse.redirect(new URL('/account?mp=forbidden', origin))
  }

  // The user must be returning to a host we control.
  if (!isAllowedReturnOrigin(origin)) {
    return NextResponse.redirect(new URL('/account?mp=error', origin))
  }

  const state = signOAuthState({
    userId,
    returnOrigin: origin,
    nonce: randomBytes(16).toString('hex'),
    ts: Date.now()
  })
  const redirectUri = getCanonicalRedirectUri(origin)
  const authUrl = getAuthorizationUrl(redirectUri, state)

  return NextResponse.redirect(authUrl)
}
