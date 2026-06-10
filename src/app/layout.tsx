import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { ReactNode } from 'react'

import NotificationsSnackbar from '@/app/_components/NotificationsSnackbar'
import ThemeRegistry from '@/app/_components/ThemeRegistry'

import './globals.scss'

export const metadata: Metadata = {
  title: 'TeamUp',
  description: 'Tennis & padel tournaments and leagues'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <ThemeRegistry>
            {children}
            <NotificationsSnackbar />
          </ThemeRegistry>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
