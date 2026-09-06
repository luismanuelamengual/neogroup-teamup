import { withSerwist } from '@serwist/turbopack'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@neogroup/neorm', 'pg'],
  env: {
    // Vercel sets VERCEL_ENV ('production' | 'preview' | 'development') at
    // build time but only on the server. Re-exposing it under a NEXT_PUBLIC_
    // name inlines its build-time value into the client bundle too, so
    // client components (e.g. StaleTournamentBanners) can gate on it without
    // depending on the "Automatically expose System Environment Variables"
    // project setting. Undefined locally, so it also resolves to falsy there.
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.gravatar.com'
      },
      {
        protocol: 'https',
        hostname: 'gravatar.com'
      }
    ]
  }
}

export default withSerwist(nextConfig)
