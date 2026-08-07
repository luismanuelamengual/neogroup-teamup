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

/**
 * Normalizes a person's name to Title Case: trims, collapses internal
 * whitespace, and capitalizes the first letter of each word — including
 * after a hyphen or apostrophe (e.g. "jean-paul" -> "Jean-Paul", "o'brien" ->
 * "O'Brien"). Locale-aware casefolding so accented letters (á, é, í, ó, ú, ñ,
 * ü) normalize correctly.
 *
 * Examples: "yamila pErez" -> "Yamila Perez", "RICARDO MOYA" -> "Ricardo Moya".
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_match, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase('es')
    )
}

/** True when the given role is the organization administrator. */
export function isAdministrator(roleId: Role | null | undefined): boolean {
  return roleId === Role.ADMINISTRATOR
}

/**
 * Full name shown across the app, e.g. "Yamila Perez". Names are stored
 * exactly as entered (whatever casing the user typed), so this normalizes
 * them to Title Case on the way out — display only, the stored value is
 * never touched.
 */
export function getUserDisplayName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  const firstName = user.firstName ? normalizeName(user.firstName) : null
  const lastName = user.lastName ? normalizeName(user.lastName) : null
  const fullName = [firstName, lastName].filter(Boolean).join(' ')

  return fullName || user.email
}

/** Short name: first initial of the first name + last name (e.g. "Luis Amengual" -> "L. Amengual"). */
export function getUserShortName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  const firstName = user.firstName ? normalizeName(user.firstName) : null
  const lastName = user.lastName ? normalizeName(user.lastName) : null

  if (firstName && lastName) {
    return `${firstName.charAt(0)}. ${lastName}`
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ')

  return fullName || user.email
}
