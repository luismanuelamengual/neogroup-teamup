import './globals.scss'
import type { Metadata, Viewport } from 'next'
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ThemeRegistry>
          {children}
          <Toaster position="bottom-center" />
        </ThemeRegistry>
      </body>
    </html>
  )
}
