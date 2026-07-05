import './globals.scss'
import { SerwistProvider } from '@serwist/turbopack/react'
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import Script from 'next/script'
import { ReactNode } from 'react'
import { Toaster } from 'react-hot-toast'
import ThemeRegistry from '@/app/components/ThemeRegistry'
import { resolveOrganizationImage } from '@/app/services/organizations'
import { getPwaConfig } from '@/app/services/pwa'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID

/**
 * Reads the organization domain slug the proxy already resolved from the
 * subdomain and injected as `x-org-domain`. This lets the document metadata
 * (title, PWA manifest link, Apple touch icon, theme color) be tailored per
 * tenant WITHOUT any database lookup — the slug is all getPwaConfig and
 * resolveOrganizationImage need. Null on the root domain (teamup.ar).
 */
async function resolveOrgDomain(): Promise<string | null> {
  const headersList = await headers()

  return headersList.get('x-org-domain')
}

export async function generateMetadata(): Promise<Metadata> {
  const domain = await resolveOrgDomain()
  const pwa = getPwaConfig(domain)

  return {
    applicationName: pwa.name,
    title: {
      default: pwa.name,
      template: `%s · ${pwa.name}`
    },
    description: 'Torneos y ligas de tenis y pádel',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: pwa.shortName
    },
    formatDetection: {
      telephone: false
    },
    icons: {
      icon: '/favicon.ico',
      apple: resolveOrganizationImage(domain, 'apple-touch-icon.png')
    }
  }
}

export async function generateViewport(): Promise<Viewport> {
  const domain = await resolveOrgDomain()
  const pwa = getPwaConfig(domain)

  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: pwa.themeColor
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      {GTM_ID && (
        <head>
          <Script id="gtm-script" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        </head>
      )}
      <body>
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
        <SerwistProvider swUrl="/serwist/sw.js">
          <ThemeRegistry>
            {children}
            <Toaster position="bottom-center" />
          </ThemeRegistry>
        </SerwistProvider>
      </body>
    </html>
  )
}
