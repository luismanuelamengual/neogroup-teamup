/** FE user models shared across the app (auth module owns the user concept). */

export type Profile = 'organizer' | 'player'

/** Plain serializable user object passed from server code to client components. */
export interface UserDto {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
  displayName: string
  avatarUrl: string
}

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
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
