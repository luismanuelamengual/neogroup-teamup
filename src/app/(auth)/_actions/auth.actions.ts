'use server'

import bcrypt from 'bcryptjs'
import { User } from '@/app/_models/User'

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
}

export interface ActionResult {
  success: boolean
  error?: string
}

/** Creates a new user with email/password credentials. */
export async function registerUser(input: RegisterInput): Promise<ActionResult> {
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

  return { success: true }
}
