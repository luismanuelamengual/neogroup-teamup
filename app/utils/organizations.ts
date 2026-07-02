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
