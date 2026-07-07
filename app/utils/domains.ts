/**
 * Resolves the organization domain slug from an HTTP Host header value.
 *
 * Pure string manipulation with no database or Node.js-only imports, so it is
 * safe to use from BOTH the Edge Runtime (the `proxy.ts` middleware) and the
 * Node.js runtime (route handlers / server components). This is the single
 * source of truth for the host → domain mapping — do not duplicate it.
 *
 * - "teamup.ar" | "www.teamup.ar"  →  null  (root domain, no org)
 * - "club-aleman.teamup.ar"        →  "club-aleman"
 * - "localhost:3000"               →  DEV_ORGANIZATION_DOMAIN env var (or null)
 */
export function resolveOrganizationDomain(host: string): string | null {
  if (!host || host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return process.env.DEV_ORGANIZATION_DOMAIN ?? null
  }

  const parts = host.split('.')

  // Root domain: "teamup.ar" (2 parts) or "www.teamup.ar" (3 parts, first === 'www')
  if (parts.length === 2 || (parts.length === 3 && parts[0] === 'www')) {
    return null
  }

  return parts[0] || null
}

/**
 * Builds the app's own absolute base URL (e.g. "https://club-aleman.teamup.ar")
 * from an HTTP Host header value. Used anywhere the server needs to build an
 * absolute link back into the app — email verification, password reset, the
 * tournament join link, etc. — since each organization is served from its own
 * subdomain rather than one fixed origin, so a single static env var can't
 * cover every organization.
 *
 * Falls back to NEXT_PUBLIC_APP_URL when there's no Host header to read (e.g.
 * `host` came back empty).
 */
export function resolveAppUrl(host: string): string {
  if (!host) {
    return process.env.NEXT_PUBLIC_APP_URL ?? ''
  }

  const protocol = host.includes('localhost') ? 'http' : 'https'

  return `${protocol}://${host}`
}

/**
 * Normalizes a `callbackUrl` value into a safe, same-origin relative path
 * (e.g. "/tournaments/36/join"), or `null` when there's nothing usable.
 *
 * `callbackUrl` can arrive in two shapes:
 * - Absolute, e.g. "https://club-aleman.teamup.ar/tournaments/36/join" — this
 *   is what Auth.js's middleware sets by default (`signInUrl.searchParams.set
 *   ("callbackUrl", request.nextUrl.href)`) when it redirects an unauthenticated
 *   visitor to /login.
 * - Already relative, e.g. "/tournaments/36/join" — when a page builds it
 *   manually (register/select-role forwarding it along).
 *
 * Either way we discard the origin and keep only path + search + hash. This
 * is what makes the redirect safe: even if `callbackUrl` came from an
 * untrusted query string pointing at another host, the result always stays
 * on the current app.
 */
export function resolveCallbackPath(callbackUrl?: string | null): string | null {
  if (!callbackUrl) {
    return null
  }

  // Protocol-relative URLs ("//evil.com/x") must NOT be treated as relative —
  // the browser would still navigate cross-origin.
  if (callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
    return callbackUrl
  }

  try {
    const url = new URL(callbackUrl)

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
