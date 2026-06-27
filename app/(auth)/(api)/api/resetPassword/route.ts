import bcrypt from 'bcryptjs'
import { PasswordResetToken } from '@/app/(auth)/models/PasswordResetToken'
import { ApiException } from '@/app/models/ApiException'
import { User } from '@/app/models/User'
import { withApi } from '@/app/utils/api-server'

/** POST /api/resetPassword — validates a reset token and updates the user password. */
export const POST = withApi(async (request) => {
  const { token, password } = (await request.json()) as { token: string; password: string }

  if (!token || !password) {
    throw new ApiException('missingFields')
  }

  if (password.length < 6) {
    throw new ApiException('passwordTooShort')
  }

  const record = await PasswordResetToken.where('token', token).first()

  if (!record) {
    throw new ApiException('invalidToken')
  }

  if (new Date() > record.expiresAt) {
    await record.delete()
    throw new ApiException('expiredToken')
  }

  const user = await User.withoutGlobalScopes().find(record.userId)

  if (!user) {
    throw new ApiException('invalidToken')
  }

  user.passwordHash = await bcrypt.hash(password, 10)
  await user.save()
  await record.delete()

  return null
})
