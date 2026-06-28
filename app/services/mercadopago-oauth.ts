import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Helpers for the Mercado Pago OAuth flow in a multi-subdomain deployment.
 *
 * Mercado Pago requires a single, static redirect_uri (no wildcards), but the
 * app is served per-organization on different subdomains. To bridge that, the
 * OAuth `state` is HMAC-signed and carries the originating subdomain (return
 * origin) and the user id, so the canonical callback can authenticate the
 * request without relying on a session cookie (which would not be sent to a
 * different subdomain) and redirect the user back to where they started.
 */

/** Signed-state lifetime: the seller must finish the flow within this window. */
const STATE_MAX_AGE_MS = 10 * 60 * 1000

export interface OAuthState {
  /** Id of the organizer who initiated the connection. */
  userId: number
  /** Full origin to return to after the callback (e.g. https://club-aleman.teamup.ar). */
  returnOrigin: string
  /** Random nonce (defense in depth against replay). */
  nonce: string
  /** Issued-at timestamp (ms). */
  ts: number
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET

  if (!secret) {
    throw new Error('AUTH_SECRET is required to sign the Mercado Pago OAuth state')
  }

  return secret
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** Signs an OAuth state payload as `<payload>.<hmac>` (both base64url). */
export function signOAuthState(payload: OAuthState): string {
  const body = base64url(JSON.stringify(payload))
  const signature = createHmac('sha256', getSecret()).update(body).digest('base64url')

  return `${body}.${signature}`
}

/** Verifies and decodes a signed OAuth state, returning null when invalid or expired. */
export function verifyOAuthState(state: string | null | undefined): OAuthState | null {
  if (!state) {
    return null
  }

  const [body, signature] = state.split('.')

  if (!body || !signature) {
    return null
  }

  const expected = createHmac('sha256', getSecret()).update(body).digest('base64url')
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null
  }

  let payload: OAuthState

  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState
  } catch {
    return null
  }

  if (
    typeof payload.userId !== 'number' ||
    typeof payload.returnOrigin !== 'string' ||
    typeof payload.ts !== 'number' ||
    Date.now() - payload.ts > STATE_MAX_AGE_MS
  ) {
    return null
  }

  return payload
}

/**
 * Root domain the app runs on (e.g. "teamup.ar"), derived from MP_REDIRECT_URI
 * when configured. Returns null in local dev (no canonical redirect set).
 */
export function getAppRootDomain(): string | null {
  const redirectUri = process.env.MP_REDIRECT_URI

  if (!redirectUri) {
    return null
  }

  try {
    return new URL(redirectUri).hostname
  } catch {
    return null
  }
}

/**
 * Whether an origin is a legitimate return target: localhost in dev, or the app
 * root domain / one of its subdomains in production. Prevents open redirects and
 * signing attacker-controlled return origins.
 */
export function isAllowedReturnOrigin(origin: string): boolean {
  let host: string

  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return true
  }

  const root = getAppRootDomain()

  // No canonical domain configured (local/dev): allow non-loopback hosts too.
  if (!root) {
    return true
  }

  return host === root || host.endsWith(`.${root}`)
}

/**
 * The static redirect_uri registered in the Mercado Pago application. Uses
 * MP_REDIRECT_URI when set (required in multi-subdomain production); otherwise
 * falls back to the current request origin (fine for local/single-domain dev).
 */
export function getCanonicalRedirectUri(requestOrigin: string): string {
  return process.env.MP_REDIRECT_URI || `${requestOrigin}/api/mercadopago/callback`
}
