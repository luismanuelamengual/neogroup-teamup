import type { Dto } from '@neogroup/neorm'
import type { User } from '@/app/(auth)/entities/User'

/** FE user models shared across the app (the auth module owns the user concept). */

/** Available roles. A user gets a role once (at registration or first login) and cannot switch it. */
export const UserRoles = {
  ORGANIZER: 1,
  PLAYER: 2
} as const

export type UserRoleId = (typeof UserRoles)[keyof typeof UserRoles]

/** Plain serializable user object passed from server code to client components. */
export type UserDto = Omit<Dto<User>, 'passwordHash'>

/** The signed-in user, as stored in the user store and the session. */
export interface SessionUser {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
  displayName: string
  avatarUrl: string
  roleId: UserRoleId | null
}

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  roleId: UserRoleId
}

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
