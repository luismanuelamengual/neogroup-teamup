import { ManageableRoles, Role } from '@/app/models/Role'

/** User helpers shared across the app. */

/**
 * True for the roles a user may end up with through registration / role
 * selection / the administrator's user management screen.
 *
 * `Role.ADMINISTRATOR` is deliberately excluded: administrators are never
 * self-assignable nor assignable from the UI — they are created by a seed or
 * a maintenance script.
 */
export function isValidRole(value: unknown): value is Role {
  return ManageableRoles.includes(value as Role)
}

/** True when the given role is the organization administrator. */
export function isAdministrator(roleId: Role | null | undefined): boolean {
  return roleId === Role.ADMINISTRATOR
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
