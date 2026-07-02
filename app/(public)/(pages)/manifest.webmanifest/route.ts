import { NextRequest, NextResponse } from 'next/server'
import { resolveOrganizationImage } from '@/app/services/organizations'
import { getPwaConfig } from '@/app/services/pwa'
import { resolveOrganizationDomain } from '@/app/utils/organizations'

/**
 * Dynamic Web App Manifest.
 *
 * The app is multi-tenant (one subdomain per organization), so a single static
 * `manifest.json` cannot work: every organization needs its own name, icons and
 * colors when installed as a PWA. This route resolves the organization from the
 * request Host header and returns a manifest tailored to it.
 *
 * Note: this path (`/manifest.webmanifest`) contains a dot, so the auth
 * middleware — whose matcher excludes `.*\..*` — never runs for it. That is
 * intentional: the manifest must be publicly fetchable by the browser without a
 * session. Since the middleware — and therefore the `x-org-domain` header —
 * never runs here, we resolve the domain slug directly from the Host header.
 * This is a pure string parse: no database lookup is needed to build the
 * manifest.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const domain = resolveOrganizationDomain(request.headers.get('host') ?? '')
  const pwa = getPwaConfig(domain)
  const manifest = {
    name: pwa.name,
    short_name: pwa.shortName,
    description: 'Torneos y ligas de tenis y pádel',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: pwa.themeColor,
    background_color: pwa.backgroundColor,
    icons: [
      {
        src: resolveOrganizationImage(domain, 'icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: resolveOrganizationImage(domain, 'icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: resolveOrganizationImage(domain, 'icon-maskable-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      // The manifest varies per subdomain; never share it across hosts.
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  })
}
