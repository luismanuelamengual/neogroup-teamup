import { Role } from '@/app/models/Role'

/** User helpers shared across the app. */

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

/** Short name: first initial of the first name + last name (e.g. "Luis Amengual" -> "L. Amengual"). */
export function getUserShortName(user: {
  firstName: string | null
  lastName: string | null
  nickname: string | null
  email: string
}): string {
  if (user.firstName && user.lastName) {
    const initial = user.firstName.trim().charAt(0).toUpperCase()

    return `${initial}. ${user.lastName.trim()}`
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')

  return fullName || user.email
}
