import { redirect } from 'next/navigation'
import ProfileSelector from '@/app/(auth)/components/ProfileSelector'
import { auth } from '@/app/(auth)/services/auth'

export default async function SelectProfilePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <ProfileSelector callbackUrl={callbackUrl ?? null} />
}
