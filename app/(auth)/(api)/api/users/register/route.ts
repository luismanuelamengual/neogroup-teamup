import { Repository } from '@neogroup/neorm'
import bcrypt from 'bcryptjs'
import { RegisterInput } from '@/app/(auth)/actions/auth'
import { User } from '@/app/(auth)/models/User'
import { isValidRoleId } from '@/app/(auth)/utils/user'
import { ApiException } from '@/app/models/ApiException'
import { withApi } from '@/app/utils/api-server'

/** POST /api/users/register — creates a new user with email/password credentials (public). */
export const POST = withApi(async (request) => {
  const input = (await request.json()) as RegisterInput
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiException('invalidEmail')
  }

  if (password.length < 6) {
    throw new ApiException('passwordTooShort')
  }

  if (!firstName || !lastName) {
    throw new ApiException('missingFields')
  }

  if (!isValidRoleId(input.roleId)) {
    throw new ApiException('invalidRole')
  }

  const existing = await Repository.get(User).where('email', email).first()

  if (existing) {
    throw new ApiException('emailAlreadyRegistered')
  }

  const user = new User()

  user.email = email
  user.passwordHash = await bcrypt.hash(password, 10)
  user.firstName = firstName
  user.lastName = lastName
  user.nickname = null
  user.roleId = input.roleId
  await Repository.get(User).save(user)

  return { id: user.id }
})
