import { redirect } from 'next/navigation'
import RoleSelector from '@/app/(auth)/components/RoleSelector'
import { auth } from '@/app/(auth)/services/auth'

/** One-time role selection for users signing in without an assigned role (e.g. first Google login). */
export default async function SelectRolePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.roleId) {
    redirect('/')
  }

  return <RoleSelector callbackUrl={callbackUrl ?? null} />
}
