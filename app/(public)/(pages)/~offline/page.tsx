import type { Metadata } from 'next'

/**
 * Offline fallback page.
 *
 * Precached by the service worker (see app/sw.ts) and shown when a navigation
 * request fails because the device is offline. It must stay fully static and
 * free of per-request/organization data — it has to render from cache with no
 * network. Excluded from the auth middleware (see proxy.ts) so it renders for
 * everyone. The service worker precaches it by fetching the URL at install
 * time (see additionalPrecacheEntries in app/serwist/[path]/route.ts).
 */
export const metadata: Metadata = {
  title: 'Sin conexión'
}

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: '#0f172a',
        background: '#f6f8f8'
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Estás sin conexión</h1>
      <p style={{ maxWidth: '28rem', margin: 0, color: '#475569', lineHeight: 1.5 }}>
        No pudimos cargar esta página. Revisá tu conexión a internet y volvé a intentarlo.
      </p>
    </main>
  )
}
