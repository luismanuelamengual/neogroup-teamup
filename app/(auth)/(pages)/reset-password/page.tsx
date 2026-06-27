import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import OrgNotFound from '@/app/(auth)/components/OrgNotFound'
import ResetPasswordForm from '@/app/(auth)/components/ResetPasswordForm'
import { Organization } from '@/app/(auth)/models/Organization'

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''

  if (orgDomain === '__root__') {
    redirect('/')
  }

  const organization = await Organization.where('domainName', orgDomain).first()

  if (!organization) {
    return <OrgNotFound orgDomain={orgDomain} />
  }

  const { token } = await searchParams

  if (!token) {
    return (
      <Box sx={{ maxWidth: 420, mx: 'auto', mt: 8, px: 2 }}>
        <Alert severity="error">El enlace no es válido o ya fue utilizado.</Alert>
        <Box sx={{ mt: 2 }}>
          <Link href="/forgot-password">Recuperar contraseña</Link>
        </Box>
      </Box>
    )
  }

  return <ResetPasswordForm token={token} />
}
