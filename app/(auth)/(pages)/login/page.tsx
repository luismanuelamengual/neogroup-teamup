import LoginForm from '@/app/(auth)/components/LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams

  return <LoginForm callbackUrl={callbackUrl ?? null} />
}
