import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import OrgNotFound from '@/app/(auth)/components/OrgNotFound'
import { Organization } from '@/app/(auth)/models/Organization'

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 8, px: 2 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        Verificá tu email
      </Typography>

      {error === 'invalidToken' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          El enlace de verificación no es válido. Por favor, registrate nuevamente.
        </Alert>
      )}

      {error === 'expiredToken' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          El enlace de verificación expiró. Por favor, registrate nuevamente.
        </Alert>
      )}

      {!error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Revisá tu bandeja de entrada y hacé clic en el enlace de verificación para activar tu cuenta.
        </Alert>
      )}

      <Typography variant="body2" sx={{ mt: 2 }}>
        <Link href="/login">Ingresar</Link>
      </Typography>
    </Box>
  )
}
