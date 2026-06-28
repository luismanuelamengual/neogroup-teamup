import { NextRequest, NextResponse } from 'next/server'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { exchangeCodeForToken, saveMercadoPagoAccount } from '@/app/services/mercadopago'
import { getCanonicalRedirectUri, isAllowedReturnOrigin, verifyOAuthState } from '@/app/services/mercadopago-oauth'

/**
 * GET /api/mercadopago/callback — Mercado Pago OAuth redirect target (canonical).
 *
 * Authenticates the request via the HMAC-signed `state` (not the session, which
 * is not shared across subdomains), exchanges the `code` for tokens, persists
 * the organizer's account, and redirects back to the originating subdomain.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  const origin = url.origin
  const code = url.searchParams.get('code')
  const payload = verifyOAuthState(url.searchParams.get('state'))

  // Without a valid state we don't know where to return to: fall back to the
  // canonical origin's account page with an error.
  if (!payload || !isAllowedReturnOrigin(payload.returnOrigin)) {
    return NextResponse.redirect(new URL('/account?mp=error', origin))
  }

  const accountUrl = (status: string) => NextResponse.redirect(`${payload.returnOrigin}/account?mp=${status}`)

  if (!code) {
    return accountUrl('error')
  }

  try {
    // The organizer who initiated must still be a valid organizer account.
    const user = await User.withoutGlobalScopes().find(payload.userId)

    if (!user || user.roleId !== Role.ORGANIZER) {
      return accountUrl('forbidden')
    }

    const redirectUri = getCanonicalRedirectUri(origin)
    const token = await exchangeCodeForToken(code, redirectUri)

    await saveMercadoPagoAccount(payload.userId, token)

    return accountUrl('connected')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[mercadopago/callback] Failed to connect account:', error)

    return accountUrl('error')
  }
}
