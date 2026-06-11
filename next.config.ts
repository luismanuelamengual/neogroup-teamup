import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
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
