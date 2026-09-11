import { DB } from '@neogroup/neorm'
import { sendPasswordResetEmail } from '@/app/(auth)/services/passwords'
import { resolveSiteId } from '@/app/(protected)/(sites)/services/sites'
import { UserFilters } from '@/app/(protected)/(users)/models/UserFilters'
import { CreateUserInput, UpdateUserInput } from '@/app/(protected)/(users)/models/UserInput'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { getCurrentOrganizationId } from '@/app/services/organization-context'
import { isValidRole } from '@/app/utils/users'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Administration of the users of an organization (the ABM behind the
 * administrator's "Usuarios" page).
 *
 * Two things are deliberately consistent across every function here:
 *
 * - Queries run with `withoutGlobalScope('activeScope', 'emailVerifiedScope')`
 *   so banned and not-yet-verified accounts are visible and manageable (they
 *   are exactly the ones an administrator needs to see), while the
 *   OrganizationScope stays on — no cross-organization access, ever. Every
 *   lookup by id also re-checks `organizationId` explicitly.
 *
 * - Administrator accounts are out of scope: they are never listed, edited or
 *   deleted from the UI. They are provisioned by a seed/maintenance script, so
 *   an administrator can neither lock itself out nor escalate somebody else.
 */

/**
 * Base query for the manageable users of an organization: everyone but the
 * administrators. Users with no role yet (a first Google login that never
 * reached /select-role) are kept — they are precisely the accounts an
 * administrator may need to fix.
 *
 * Only `activeScope` and `emailVerifiedScope` are dropped — a deactivated or
 * unverified account is exactly what an administrator needs to see. The
 * OrganizationScope stays on, so this never reaches out of the organization.
 */
function manageableUsersQuery() {
  return User.withoutGlobalScope('activeScope', 'emailVerifiedScope').where((group) => {
    group.where('roleId', '!=', Role.ADMINISTRATOR).orWhereNull('roleId')
  })
}

/** Finds a manageable user of the organization, or throws a 404. */
async function findManageableUser(userId: number): Promise<User> {
  const user = await manageableUsersQuery().where('id', userId).first()

  if (!user) {
    throw new ApiException('Usuario no encontrado', 404)
  }

  return user
}

/**
 * Validates and normalizes an email address, and ensures it is not already in
 * use by another user of the organization. `excludeUserId` lets an update keep
 * the user's own current email without tripping over itself.
 */
async function normalizeEmail(rawEmail: unknown, excludeUserId?: number): Promise<string> {
  const email = String(rawEmail ?? '')
    .trim()
    .toLowerCase()

  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiException('El email no es válido')
  }

  // Uniqueness is per organization, so the OrganizationScope is left on; only
  // the active/verified filters come off, because an address taken by a
  // deactivated account is still taken.
  const existingQuery = User.withoutGlobalScope('activeScope', 'emailVerifiedScope').where('email', email)

  if (excludeUserId) {
    existingQuery.where('id', '!=', excludeUserId)
  }

  const existing = await existingQuery.first()

  if (existing) {
    throw new ApiException('Ya existe un usuario con ese email')
  }

  return email
}

/** Validates and normalizes the personal fields shared by creation and update. */
function normalizeProfile(input: Partial<CreateUserInput & UpdateUserInput>) {
  const firstName = (input.firstName ?? '').trim()
  const lastName = (input.lastName ?? '').trim()

  if (!firstName || !lastName) {
    throw new ApiException('El nombre y el apellido son obligatorios')
  }

  if (!isValidRole(input.roleId)) {
    throw new ApiException('El rol seleccionado no es válido')
  }

  return {
    firstName,
    lastName,
    phoneNumber: (input.phoneNumber ?? '').trim() || null,
    roleId: input.roleId as Role
  }
}

/**
 * Paginated listing of the organization users, searchable by name or email
 * and filterable by role.
 */
export async function getUsers({ query, roleId = null, page = 1, pageSize = 10 }: UserFilters = {}): Promise<
  PaginatedResponse<User[]>
> {
  const usersQuery = manageableUsersQuery()
  const normalized = (query ?? '').trim()

  if (roleId != null) {
    usersQuery.where('roleId', roleId)
  }

  if (normalized.length > 0) {
    const pattern = `%${normalized}%`

    // Explicit ILIKE: inside a grouping callback neorm's whereLike defaults to a
    // case-sensitive LIKE on Postgres (same caveat as services/players.ts).
    usersQuery.where((group) => {
      group
        .where('firstName', 'ILIKE', pattern)
        .orWhere('lastName', 'ILIKE', pattern)
        .orWhere('email', 'ILIKE', pattern)
    })
  }

  const result = await usersQuery.orderBy('firstName').orderBy('lastName').paginate(pageSize, page)

  // Never let a hash reach the client, not even a null one.
  result.data = result.data.map((user) => {
    user.passwordHash = null

    return user
  })

  return result
}

/**
 * Creates a user of the organization and emails them an invitation to set their
 * own password.
 *
 * The account is created already verified (an administrator vouching for the
 * address is verification enough) and with no password hash: until the user
 * follows the invitation link, credentials login simply finds nothing to match.
 */
export async function createUser(input: CreateUserInput, host: string): Promise<User> {
  const profile = normalizeProfile(input)
  const email = await normalizeEmail(input.email)
  const user = new User()

  // An insert applies no scopes, so this is the one place the organization is
  // written rather than filtered by.
  user.organizationId = await getCurrentOrganizationId()
  user.email = email
  user.passwordHash = null
  user.firstName = profile.firstName
  user.lastName = profile.lastName
  user.phoneNumber = profile.phoneNumber
  user.siteId = await resolveSiteId(input.siteId)
  user.roleId = profile.roleId
  user.emailVerified = true
  user.active = true
  await user.save()

  await sendPasswordResetEmail(user, { host, invitation: true })

  return user
}

/**
 * Updates the email, profile, role and active flag of a user of the
 * organization. The email may change as long as it stays unique within the
 * organization.
 */
export async function updateUser(userId: number, input: UpdateUserInput): Promise<User> {
  const user = await findManageableUser(userId)
  const profile = normalizeProfile(input)

  user.email = await normalizeEmail(input.email, user.id)
  user.firstName = profile.firstName
  user.lastName = profile.lastName
  user.phoneNumber = profile.phoneNumber
  user.siteId = await resolveSiteId(input.siteId)
  user.roleId = profile.roleId
  user.active = input.active !== false
  await user.save()

  user.passwordHash = null

  return user
}

/**
 * Number of rows that reference a user and would either break a foreign key or
 * silently corrupt historical data if the row disappeared.
 *
 * `password_reset_tokens`, `email_verification_tokens` and `player_statistics`
 * are not counted: they all cascade on delete.
 */
async function countUserReferences(userId: number): Promise<number> {
  const [tournaments, competitors, rankings, servicePayments] = await Promise.all([
    DB.table('tournaments').where('ownerId', userId).count(),
    DB.table('competitors').whereArrayContains('playerIds', userId).count(),
    DB.table('rankings').where('userId', userId).count(),
    DB.table('service_payments').where('userId', userId).count()
  ])

  return Number(tournaments) + Number(competitors) + Number(rankings) + Number(servicePayments)
}

/**
 * Permanently deletes a user of the organization.
 *
 * Users with history (tournaments they own, tournaments they entered, ranking
 * points or payments) are rejected instead of deleted: the database would
 * refuse the DELETE anyway, and erasing them would rewrite past results. The
 * administrator can deactivate those accounts instead.
 */
export async function deleteUser(userId: number): Promise<void> {
  const user = await findManageableUser(userId)
  const references = await countUserReferences(user.id)

  if (references > 0) {
    throw new ApiException(
      'El usuario tiene actividad registrada (torneos, inscripciones, rankings o pagos) y no puede eliminarse. Podés desactivarlo para bloquear su acceso.'
    )
  }

  await user.delete()
}

/** Sends the password reset email to a user of the organization. */
export async function resetUserPassword(userId: number, host: string): Promise<void> {
  const user = await findManageableUser(userId)

  await sendPasswordResetEmail(user, { host })
}
