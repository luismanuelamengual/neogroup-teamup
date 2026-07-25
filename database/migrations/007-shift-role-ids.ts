import { DB } from '@neogroup/neorm'

/**
 * Shifts every role id one position up to make room for the new
 * `Role.ADMINISTRATOR` at the head of the enum:
 *
 *   before → after
 *   1 (organizer) → 2 (organizer)
 *   2 (player)    → 3 (player)
 *                   1 is now ADMINISTRATOR
 *
 * The administrator could have taken the free `0` slot instead, but `0` is
 * falsy in JavaScript: every `if (user.roleId)` in the codebase (and every one
 * written in the future) would silently treat an administrator as a user with
 * no role. Starting the enum at 1 removes that whole class of bug.
 *
 * Two columns store role ids and both are migrated here:
 *   - `users.roleId`                           (INTEGER, nullable)
 *   - `organizations.allowedRegistrationRoles` (INT[] on PostgreSQL, JSON TEXT on SQLite)
 *
 * The order of the UPDATEs matters: player (2 → 3) must run BEFORE organizer
 * (1 → 2), otherwise the organizers promoted to 2 would be shifted a second
 * time and end up as players.
 *
 * Runs once (the runner tracks it in the `migrations` table); on a database
 * created after this change both tables are empty or already use the new ids,
 * so it is a no-op.
 *
 * Note: migration 001 still documents the original ids (ORGANIZER=1, PLAYER=2)
 * in a comment. That is on purpose — it has already been applied in production
 * and must stay untouched; this file is the record of the current numbering.
 */

const OLD_ORGANIZER = 1
const OLD_PLAYER = 2
const NEW_ORGANIZER = 2
const NEW_PLAYER = 3

/**
 * Normalizes a raw `allowedRegistrationRoles` value into a number[]. Selected
 * through the query builder it skips the entity cast, so PostgreSQL hands back
 * a native JS array while SQLite returns the JSON-encoded TEXT.
 */
function toIntArray(value: unknown): number[] {
  if (value == null) {
    return []
  }

  if (Array.isArray(value)) {
    return value.map((item) => Number(item))
  }

  try {
    const parsed = JSON.parse(String(value))

    return Array.isArray(parsed) ? parsed.map((item) => Number(item)) : []
  } catch {
    return []
  }
}

export default {
  name: '007-shift-role-ids',

  async up(): Promise<void> {
    await DB.transaction(async () => {
      // 1. users.roleId — players first, then organizers (see note above).
      await DB.table('users').where('roleId', OLD_PLAYER).update({ roleId: NEW_PLAYER })
      await DB.table('users').where('roleId', OLD_ORGANIZER).update({ roleId: NEW_ORGANIZER })

      // 2. organizations.allowedRegistrationRoles — remapped row by row through
      //    the query builder so the same code works on INT[] and on JSON TEXT.
      //    Raw rows are not mapped through the entity layer, so read the key
      //    case-insensitively: PostgreSQL folds unquoted identifiers to lower
      //    case while SQLite preserves the declared casing.
      const organizations = await DB.table('organizations').select('id', 'allowedRegistrationRoles').get()

      for (const organization of organizations) {
        const roles = toIntArray(organization.allowedRegistrationRoles ?? organization.allowedregistrationroles)

        if (roles.length === 0) {
          continue
        }

        const shifted = roles.map((role) =>
          role === OLD_PLAYER ? NEW_PLAYER : role === OLD_ORGANIZER ? NEW_ORGANIZER : role
        )

        await DB.table('organizations').where('id', organization.id).update({ allowedRegistrationRoles: shifted })
      }
    })
  }
}
