import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ProfileSelector from '@/app/(auth)/select-profile/_components/ProfileSelector'

export default async function SelectProfilePage({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <ProfileSelector callbackUrl={callbackUrl ?? null} />
}
