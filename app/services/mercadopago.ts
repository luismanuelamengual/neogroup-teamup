import { randomUUID } from 'crypto'
import { MercadoPagoConfig, OAuth, Payment, PaymentRefund, Preference } from 'mercadopago'
import { MercadoPagoAccount } from '@/app/models/MercadoPagoAccount'

/**
 * Mercado Pago "Split payments (marketplace)" client, built on the official
 * `mercadopago` SDK. Implements the OAuth Authorization Code flow used to
 * connect an organizer account, and the Checkout Pro preference + payment APIs
 * used to charge a registration with a `marketplace_fee` that is settled to the
 * TeamUp (marketplace) account while the remainder goes to the organizer.
 *
 * The public surface of this module is SDK-agnostic (plain types below), so the
 * rest of the app and the tests don't depend on the SDK internals.
 *
 * Docs:
 * - OAuth:        https://www.mercadopago.com.ar/developers/en/docs/split-payments/additional-content/security/oauth/creation
 * - Marketplace:  https://www.mercadopago.com.ar/developers/en/docs/split-payments/integration-configuration/integrate-marketplace
 */

/** Refresh the access token when it is within this window of expiring. */
const TOKEN_REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000

export interface MpTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  user_id: number
  refresh_token: string
  public_key: string
  live_mode: boolean
}

export interface MpPreferenceItem {
  title: string
  quantity: number
  unit_price: number
  currency_id: string
}

export interface MpPreferenceInput {
  items: MpPreferenceItem[]
  marketplaceFee: number
  externalReference: string
  notificationUrl: string
  backUrls: { success: string; failure: string; pending: string }
  payerEmail?: string
}

export interface MpPreferenceResponse {
  id: string
  init_point: string
  sandbox_init_point: string
}

export interface MpPaymentResponse {
  id: number
  status: string
  status_detail: string
  external_reference: string | null
  transaction_amount: number
  currency_id: string
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MP_CLIENT_ID
  const clientSecret = process.env.MP_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Mercado Pago credentials are not configured (MP_CLIENT_ID / MP_CLIENT_SECRET)')
  }

  return { clientId, clientSecret }
}

/** Builds an SDK config bound to a given access token. */
function configFor(accessToken: string): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } })
}

/**
 * Config used for OAuth token/refresh calls. Those authenticate via
 * client_id/client_secret in the body, so the bearer token is irrelevant;
 * MP_ACCESS_TOKEN (the marketplace app token) is used when present.
 */
function oauthConfig(): MercadoPagoConfig {
  return configFor(process.env.MP_ACCESS_TOKEN ?? '')
}

/** Whether Mercado Pago integration is configured on this deployment. */
export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET)
}

/** Normalizes the SDK OAuth response into our token shape. */
function toToken(response: {
  access_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  user_id?: number
  refresh_token?: string
  public_key?: string
  live_mode?: boolean
}): MpTokenResponse {
  return {
    access_token: response.access_token ?? '',
    token_type: response.token_type ?? 'bearer',
    expires_in: response.expires_in ?? 0,
    scope: response.scope ?? '',
    user_id: response.user_id ?? 0,
    refresh_token: response.refresh_token ?? '',
    public_key: response.public_key ?? '',
    live_mode: response.live_mode ?? false
  }
}

/** Builds the URL the organizer is redirected to in order to authorize TeamUp. */
export function getAuthorizationUrl(redirectUri: string, state: string): string {
  const { clientId } = getCredentials()
  const oauth = new OAuth(oauthConfig())

  return oauth.getAuthorizationURL({
    options: { client_id: clientId, redirect_uri: redirectUri, state }
  })
}

/** Exchanges an authorization code for an access/refresh token pair. */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<MpTokenResponse> {
  const { clientId, clientSecret } = getCredentials()
  const oauth = new OAuth(oauthConfig())
  const response = await oauth.create({
    body: { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }
  })

  return toToken(response)
}

/** Exchanges a refresh token for a new access token. */
export async function refreshAccessToken(refreshToken: string): Promise<MpTokenResponse> {
  const { clientId, clientSecret } = getCredentials()
  const oauth = new OAuth(oauthConfig())
  const response = await oauth.refresh({
    body: { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }
  })

  return toToken(response)
}

/** Persists (creates or updates) the organizer's Mercado Pago account from a token response. */
export async function saveMercadoPagoAccount(userId: number, token: MpTokenResponse): Promise<MercadoPagoAccount> {
  const existing = await MercadoPagoAccount.where('userId', userId).first()
  const account = existing ?? new MercadoPagoAccount()
  const now = new Date()

  if (!existing) {
    account.userId = userId
    account.createdAt = now
  }

  account.mpUserId = String(token.user_id)
  account.accessToken = token.access_token
  account.refreshToken = token.refresh_token || account.refreshToken || null
  account.publicKey = token.public_key || null
  account.liveMode = token.live_mode ?? null
  account.scope = token.scope || null
  account.expiresAt = token.expires_in ? new Date(now.getTime() + token.expires_in * 1000) : null
  account.updatedAt = now
  await account.save()

  return account
}

/**
 * Returns a valid access token for the given account, refreshing and persisting
 * it when it is expired or about to expire.
 */
export async function getValidAccessToken(account: MercadoPagoAccount): Promise<string> {
  const expiresAt = account.expiresAt ? new Date(account.expiresAt).getTime() : 0
  const needsRefresh = expiresAt > 0 && expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS

  if (needsRefresh && account.refreshToken) {
    const token = await refreshAccessToken(account.refreshToken)
    const updated = await saveMercadoPagoAccount(account.userId, token)

    return updated.accessToken
  }

  return account.accessToken
}

/** Creates a Checkout Pro preference (using the organizer token) with a marketplace fee. */
export async function createPreference(accessToken: string, input: MpPreferenceInput): Promise<MpPreferenceResponse> {
  const { clientId } = getCredentials()
  const preference = new Preference(configFor(accessToken))
  const response = await preference.create({
    body: {
      items: input.items.map((item, index) => ({
        id: String(index + 1),
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: item.currency_id
      })),
      marketplace: clientId,
      marketplace_fee: input.marketplaceFee,
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      back_urls: input.backUrls,
      auto_return: 'approved',
      ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {})
    },
    requestOptions: { idempotencyKey: randomUUID() }
  })

  return {
    id: String(response.id ?? ''),
    init_point: response.init_point ?? '',
    sandbox_init_point: response.sandbox_init_point ?? ''
  }
}

/** Fetches a payment by id using the organizer (collector) access token. */
export async function getPaymentInfo(accessToken: string, paymentId: string): Promise<MpPaymentResponse> {
  const payment = new Payment(configFor(accessToken))
  const response = await payment.get({ id: paymentId })

  return {
    id: Number(response.id ?? 0),
    status: response.status ?? '',
    status_detail: response.status_detail ?? '',
    external_reference: response.external_reference ?? null,
    transaction_amount: response.transaction_amount ?? 0,
    currency_id: response.currency_id ?? ''
  }
}

/** Fully refunds a payment (used when an approved registration cannot be honoured). */
export async function refundPayment(accessToken: string, paymentId: string): Promise<void> {
  const refunds = new PaymentRefund(configFor(accessToken))

  await refunds.total({ payment_id: paymentId })
}
