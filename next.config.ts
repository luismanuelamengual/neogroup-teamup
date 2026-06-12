import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./app/lang/request.ts')
const nextConfig: NextConfig = {
  serverExternalPackages: ['@neogroup/neorm', 'pg'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.gravatar.com'
      }
    ]
  }
}

export default withNextIntl(nextConfig)
