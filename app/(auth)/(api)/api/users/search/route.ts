import { DB, Repository } from '@neogroup/neorm'
import { User, UserDto } from '@/app/(auth)/models/User'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/users/search — searches users by name, nickname or email (partner selection). */
export const POST = withAuth(async (request, context, userId) => {
  const { query } = (await request.json()) as { query?: string }
  const normalized = (query ?? '').trim()

  if (normalized.length < 2) {
    return []
  }

  // Raw query: placeholders and case-insensitive LIKE differ per engine.
  // SQLite LIKE is already case-insensitive; PostgreSQL needs ILIKE.
  const isSqlite = (process.env.DB_DRIVER ?? 'postgres') === 'sqlite'
  const pattern = `%${normalized}%`
  const sql = isSqlite
    ? `SELECT id, email, firstName, lastName, nickname
       FROM users
       WHERE (firstName LIKE ? OR lastName LIKE ? OR nickname LIKE ? OR email LIKE ?) AND id <> ?
       ORDER BY firstName, lastName
       LIMIT 10`
    : `SELECT id, email, firstName, lastName, nickname
       FROM users
       WHERE (firstName ILIKE $1 OR lastName ILIKE $1 OR nickname ILIKE $1 OR email ILIKE $1) AND id <> $2
       ORDER BY firstName, lastName
       LIMIT 10`
  const bindings = isSqlite ? [pattern, pattern, pattern, pattern, userId] : [pattern, userId]
  const rows = await DB.query(sql, bindings)
  const users: UserDto[] = rows.map((row: Record<string, unknown>) => {
    const { passwordHash: _passwordHash, ...dto } = Repository.get(User).fromRow(row)

    return dto
  })

  return users
})
