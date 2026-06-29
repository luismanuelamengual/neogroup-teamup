import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import ForgotPasswordForm from '@/app/(auth)/components/ForgotPasswordForm'

export default async function ForgotPasswordPage() {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''

  if (!orgDomain) {
    redirect('/')
  }

  return <ForgotPasswordForm />
}
