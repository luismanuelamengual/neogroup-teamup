import bcrypt from 'bcryptjs'
import { Profile } from '@/app/_models/types'
import { User } from '@/app/_models/User'
import { ServiceResult } from '@/app/_services/types'

/** Server-side account/user domain logic (used only by API route handlers). */

export interface AccountInput {
  firstName: string
  lastName: string
  nickname: string
}

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
}

/** Creates a new user with email/password credentials. */
export async function registerUser(input: RegisterInput): Promise<ServiceResult> {
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'invalidEmail' }
  }

  if (password.length < 6) {
    return { success: false, error: 'passwordTooShort' }
  }

  if (!firstName || !lastName) {
    return { success: false, error: 'missingFields' }
  }

  const existing = await User.where('email', email).first()

  if (existing) {
    return { success: false, error: 'emailAlreadyRegistered' }
  }

  const user = new User()

  user.email = email
  user.passwordHash = await bcrypt.hash(password, 10)
  user.firstName = firstName
  user.lastName = lastName
  user.nickname = null
  user.profile = null
  await user.save()

  return { success: true, id: user.id }
}

/** Updates the personal information of a user. */
export async function updateAccount(userId: number, input: AccountInput): Promise<ServiceResult> {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    return { success: false, error: 'missingFields' }
  }

  const user = await User.find(userId)

  if (!user) {
    return { success: false, error: 'unauthorized' }
  }

  user.firstName = firstName
  user.lastName = lastName
  user.nickname = input.nickname.trim() || null
  await user.save()

  return { success: true }
}

/** Sets the active profile (organizer / player) for a user. */
export async function setProfile(userId: number, profile: Profile): Promise<ServiceResult> {
  if (profile !== 'organizer' && profile !== 'player') {
    return { success: false, error: 'invalidProfile' }
  }

  const user = await User.find(userId)

  if (!user) {
    return { success: false, error: 'unauthorized' }
  }

  user.profile = profile
  await user.save()

  return { success: true }
}
