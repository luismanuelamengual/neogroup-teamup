import { UserRoleId, UserRoles } from '@/app/(auth)/models/UserRoles'

/** User helpers shared across the app (the auth module owns the user concept). */

export function isValidRoleId(value: unknown): value is UserRoleId {
  return value === UserRoles.ORGANIZER || value === UserRoles.PLAYER
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
