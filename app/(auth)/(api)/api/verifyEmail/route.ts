import { NextRequest, NextResponse } from 'next/server'
import { EmailVerificationToken } from '@/app/(auth)/models/EmailVerificationToken'
import { User } from '@/app/models/User'
import { resolveAppUrl } from '@/app/utils/domains'

/** GET /api/verifyEmail?token=... — validates token and marks the user email as verified. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  const baseUrl = resolveAppUrl(request.headers.get('host') ?? '')

  if (!token) {
    return NextResponse.redirect(new URL('/verify-email?error=invalidToken', baseUrl))
  }

  const record = await EmailVerificationToken.where('token', token).first()

  if (!record) {
    return NextResponse.redirect(new URL('/verify-email?error=invalidToken', baseUrl))
  }

  if (new Date() > record.expiresAt) {
    await record.delete()

    return NextResponse.redirect(new URL('/verify-email?error=expiredToken', baseUrl))
  }

  const user = await User.withoutGlobalScopes().find(record.userId)

  if (!user) {
    return NextResponse.redirect(new URL('/verify-email?error=invalidToken', baseUrl))
  }

  user.emailVerified = true
  await user.save()
  await record.delete()

  return NextResponse.redirect(new URL('/login?verified=1', baseUrl))
}
