import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Organization } from '@/app/(auth)/models/Organization'
import OrgNotFound from '@/app/(auth)/components/OrgNotFound'

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''

  if (orgDomain === '__root__') {
    redirect('/')
  }

  const organization = await Organization.where('domainName', orgDomain).first()

  if (!organization) {
    return <OrgNotFound orgDomain={orgDomain} />
  }

  const { error } = await searchParams
  const t = await getTranslations('auth')

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 8, px: 2 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        {t('verifyEmailTitle')}
      </Typography>

      {error === 'invalidToken' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('verifyEmailInvalidToken')}
        </Alert>
      )}

      {error === 'expiredToken' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('verifyEmailExpiredToken')}
        </Alert>
      )}

      {!error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('verifyEmailPending')}
        </Alert>
      )}

      <Typography variant="body2" sx={{ mt: 2 }}>
        <Link href="/login">{t('signIn')}</Link>
      </Typography>
    </Box>
  )
}
