/**
 * Per-organization PWA configuration.
 *
 * TeamUp is multi-tenant: each organization is served from its own subdomain
 * ({domain}.teamup.ar) and must install as its own, distinct PWA (different
 * name, icons and colors on the home screen / app switcher).
 *
 * This configuration lives in code — NOT in the database — and is keyed solely
 * by the domain slug (e.g. the `x-org-domain` request header set by the proxy).
 * That means rendering the PWA metadata needs no database lookup at all. Icons
 * are resolved separately via `resolveOrganizationImage`, which serves
 * `public/{domain}/{file}` when present and falls back to `public/{file}`.
 */
export interface PwaConfig {
  /** Full application name shown on install. */
  name: string
  /** Short name shown under the home-screen icon. */
  shortName: string
  /** Manifest `theme_color` — tints the browser/status bar. */
  themeColor: string
  /** Manifest `background_color` — the splash-screen background. */
  backgroundColor: string
}

const DEFAULT_CONFIG: PwaConfig = {
  name: 'TeamUp',
  shortName: 'TeamUp',
  themeColor: '#0f766e',
  backgroundColor: '#f6f8f8'
}
/**
 * Per-organization overrides, keyed by the organization's domain slug
 * (`Organization.domainName`). Anything omitted falls back to DEFAULT_CONFIG.
 * Add a new entry here when onboarding an organization that needs custom PWA
 * branding — including its display name, since we no longer read it from the DB.
 */
const CONFIG_OVERRIDES: Record<string, Partial<PwaConfig>> = {
  'club-aleman': {
    name: 'Club Alemán',
    shortName: 'Club Alemán',
    themeColor: '#111111',
    backgroundColor: '#ffffff'
  }
}

/**
 * Resolves the PWA configuration for an organization domain slug (or the
 * platform default when there is no organization, e.g. the root domain, or a
 * domain without a custom entry). No database access.
 */
export function getPwaConfig(domainName: string | null): PwaConfig {
  const override = domainName ? (CONFIG_OVERRIDES[domainName] ?? {}) : {}

  return {
    name: override.name ?? DEFAULT_CONFIG.name,
    shortName: override.shortName ?? DEFAULT_CONFIG.shortName,
    themeColor: override.themeColor ?? DEFAULT_CONFIG.themeColor,
    backgroundColor: override.backgroundColor ?? DEFAULT_CONFIG.backgroundColor
  }
}
