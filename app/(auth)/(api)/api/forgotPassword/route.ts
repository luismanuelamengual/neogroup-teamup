import { sendPasswordResetEmail } from '@/app/(auth)/services/passwords'
import { ApiException } from '@/app/models/ApiException'
import { User } from '@/app/models/User'
import { withApi } from '@/app/utils/api-server'

/** POST /api/forgotPassword — sends a password reset email if the account exists. */
export const POST = withApi(async (request, _context, organizationId) => {
  const { email: rawEmail } = (await request.json()) as { email: string }
  const email = rawEmail?.trim().toLowerCase()

  if (!email) {
    throw new ApiException('missingFields')
  }

  const user = await User.withoutGlobalScopes().where('organizationId', organizationId).where('email', email).first()

  // Always return success to avoid user enumeration
  if (!user || !user.emailVerified) {
    return null
  }

  await sendPasswordResetEmail(user, { host: request.headers.get('host') ?? '' })

  return null
})
