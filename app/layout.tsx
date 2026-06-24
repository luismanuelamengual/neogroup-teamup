import './globals.scss'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { ReactNode } from 'react'
import { Toaster } from 'react-hot-toast'
import ThemeRegistry from '@/app/components/ThemeRegistry'

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
            <Toaster position="bottom-center" />
          </ThemeRegistry>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
