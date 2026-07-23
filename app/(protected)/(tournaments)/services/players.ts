import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'

export interface PlayerOptions {
  query?: string
  excludeIds?: number[]
  page?: number
  pageSize?: number
}

const EMPTY_RESULT = (pageSize: number): PaginatedResponse<User[]> => ({
  data: [],
  total: 0,
  lastPage: 1,
  perPage: pageSize,
  from: null,
  to: null
})

/**
 * Searches players (roleId = PLAYER) by first/last name, nickname or email. Paginated,
 * analogous to `getTournaments` in `services/tournaments.ts`.
 *
 * `excludeIds` is applied in the query itself (not filtered afterwards by the caller): the
 * result is paginated, so filtering out unwanted ids after the fact would eventually starve a
 * picker once every row on a page has been excluded, instead of surfacing the next real
 * candidates. Callers pass in whatever they need excluded — the current user, players already
 * registered in a tournament, one already picked elsewhere in the same form, etc. — this
 * service doesn't need to know why.
 */
export async function getPlayers({ query, excludeIds, page = 1, pageSize = 10 }: PlayerOptions = {}): Promise<
  PaginatedResponse<User[]>
> {
  const normalized = (query ?? '').trim()

  // A single character is too broad to search on, but an empty query is valid: it returns a
  // default list of players so a picker isn't empty before the user types anything.
  if (normalized.length === 1) {
    return EMPTY_RESULT(pageSize)
  }

  const playersQuery = User.where('roleId', Role.PLAYER)

  if (excludeIds && excludeIds.length > 0) {
    playersQuery.whereNotIn('id', excludeIds)
  }

  if (normalized.length >= 2) {
    const pattern = `%${normalized}%`

    // NOTE: use explicit `ILIKE` (case-insensitive) instead of whereLike/orWhereLike here.
    // Inside this grouping callback, neorm hands us a `ConditionGroup`, whose
    // whereLike/orWhereLike default to plain `LIKE` (case-sensitive on Postgres),
    // unlike the top-level query builder where whereLike defaults to `ILIKE`.
    // That mismatch made searches like "eze" fail to match "Ezequiel" in production.
    playersQuery.where((group) => {
      group
        .where('firstName', 'ILIKE', pattern)
        .orWhere('lastName', 'ILIKE', pattern)
        .orWhere('nickname', 'ILIKE', pattern)
        .orWhere('email', 'ILIKE', pattern)
    })
  }

  const result = await playersQuery.orderBy('firstName').orderBy('lastName').paginate(pageSize, page)

  // Strip password before sending to client
  result.data = result.data.map((user) => {
    user.passwordHash = null

    return user
  })

  return result
}
