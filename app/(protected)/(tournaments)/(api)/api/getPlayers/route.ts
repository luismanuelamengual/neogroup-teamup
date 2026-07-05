import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/getPlayers — searches players (roleId = PLAYER) by name, nickname or email (partner selection). */
export const POST = withAuth(async (request, context, userId) => {
  const { query } = (await request.json()) as { query?: string }
  const normalized = (query ?? '').trim()

  if (normalized.length < 2) {
    return []
  }

  const pattern = `%${normalized}%`
  const users = await User.where('roleId', Role.PLAYER)
    .where((group) => {
      group
        .whereLike('firstName', pattern)
        .orWhereLike('lastName', pattern)
        .orWhereLike('nickname', pattern)
        .orWhereLike('email', pattern)
    })
    .where('id', '<>', userId)
    .orderBy('firstName')
    .orderBy('lastName')
    .limit(10)
    .get()

  // Strip password before sending to client
  return users.map((user) => {
    user.passwordHash = null

    return user
  })
})
