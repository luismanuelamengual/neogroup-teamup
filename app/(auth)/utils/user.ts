import { Role } from '@/app/(auth)/models/Role'

/** User helpers shared across the app (the auth module owns the user concept). */

export function isValidRole(value: unknown): value is Role {
  return value === Role.ORGANIZER || value === Role.PLAYER
}

export function getUserDisplayName(user: {
  firstName: string | null
  lastName: string | null
  nickname: string | null
  email: string
}): string {
  if (user.nickname) {
    return user.nickname
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')

  return fullName || user.email
}
