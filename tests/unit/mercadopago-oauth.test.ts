import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCanonicalRedirectUri,
  isAllowedReturnOrigin,
  signOAuthState,
  verifyOAuthState
} from '@/app/services/mercadopago-oauth'

describe('mercadopago OAuth signed state', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret'
    delete process.env.MP_REDIRECT_URI
  })

  it('round-trips a valid signed state', () => {
    const state = signOAuthState({
      userId: 42,
      returnOrigin: 'https://club-aleman.teamup.ar',
      nonce: 'abc',
      ts: Date.now()
    })
    const payload = verifyOAuthState(state)

    expect(payload?.userId).toBe(42)
    expect(payload?.returnOrigin).toBe('https://club-aleman.teamup.ar')
  })

  it('rejects a tampered payload', () => {
    const state = signOAuthState({ userId: 1, returnOrigin: 'https://teamup.ar', nonce: 'n', ts: Date.now() })
    const [, signature] = state.split('.')
    const forged = `${Buffer.from(JSON.stringify({ userId: 999, returnOrigin: 'https://evil.com', nonce: 'n', ts: Date.now() })).toString('base64url')}.${signature}`

    expect(verifyOAuthState(forged)).toBeNull()
  })

  it('rejects an expired state', () => {
    const state = signOAuthState({
      userId: 1,
      returnOrigin: 'https://teamup.ar',
      nonce: 'n',
      ts: Date.now() - 11 * 60 * 1000
    })

    expect(verifyOAuthState(state)).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(verifyOAuthState(null)).toBeNull()
    expect(verifyOAuthState('')).toBeNull()
    expect(verifyOAuthState('garbage')).toBeNull()
    expect(verifyOAuthState('a.b.c')).toBeNull()
  })

  it('verification fails when signed with a different secret', () => {
    const state = signOAuthState({ userId: 1, returnOrigin: 'https://teamup.ar', nonce: 'n', ts: Date.now() })

    process.env.AUTH_SECRET = 'another-secret'

    expect(verifyOAuthState(state)).toBeNull()
  })
})

describe('mercadopago OAuth redirect + origin allowlist', () => {
  beforeEach(() => {
    delete process.env.MP_REDIRECT_URI
  })

  it('uses MP_REDIRECT_URI when set, else the request origin', () => {
    expect(getCanonicalRedirectUri('https://club.teamup.ar')).toBe('https://club.teamup.ar/api/mercadopago/callback')

    process.env.MP_REDIRECT_URI = 'https://teamup.ar/api/mercadopago/callback'

    expect(getCanonicalRedirectUri('https://club.teamup.ar')).toBe('https://teamup.ar/api/mercadopago/callback')
  })

  it('allows localhost and the app root domain + subdomains, rejects foreign hosts', () => {
    process.env.MP_REDIRECT_URI = 'https://teamup.ar/api/mercadopago/callback'

    expect(isAllowedReturnOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedReturnOrigin('https://teamup.ar')).toBe(true)
    expect(isAllowedReturnOrigin('https://club-aleman.teamup.ar')).toBe(true)
    expect(isAllowedReturnOrigin('https://evil.com')).toBe(false)
    expect(isAllowedReturnOrigin('https://teamup.ar.evil.com')).toBe(false)
  })

  it('allows any non-loopback host in dev when no root domain is configured', () => {
    expect(isAllowedReturnOrigin('https://anything.example')).toBe(true)
  })
})
