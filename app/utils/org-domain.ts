/**
 * Resolves the organization domain slug from an HTTP Host header value.
 *
 * - "teamup.ar" | "www.teamup.ar"  →  "__root__"  (landing page, no org)
 * - "club-aleman.teamup.ar"        →  "club-aleman"
 * - "localhost:3000"               →  DEFAULT_ORG_DOMAIN env var (defaults to "demo")
 *
 * This utility is intentionally kept free of edge-only or Node-only imports so
 * it can be used in both the Edge middleware and Node.js server callbacks.
 */
export function resolveOrgDomainFromHost(host: string): string {
  if (!host || host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return process.env.DEFAULT_ORG_DOMAIN ?? 'demo'
  }

  const parts = host.split('.')

  // "teamup.ar" (2 parts) or "www.teamup.ar" (3 parts, first === 'www')
  if (parts.length === 2 || (parts.length === 3 && parts[0] === 'www')) {
    return '__root__'
  }

  const subdomain = parts[0]

  return subdomain || (process.env.DEFAULT_ORG_DOMAIN ?? 'demo')
}
