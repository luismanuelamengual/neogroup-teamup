import { DB } from '@neogroup/neorm'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { User } from '@/app/(auth)/entities/User'
import { RegisterInput } from '@/app/(auth)/models/user'
import { getUserDisplayName, UserDto } from '@/app/(auth)/models/user'
import { apiResponse, withAuth } from '@/app/utils/api-server'
import { getGravatarUrl } from '@/app/utils/gravatar'

/** POST /api/users — creates a new user with email/password credentials (public). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const input = (await request.json()) as RegisterInput
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return apiResponse({ success: false, error: 'invalidEmail' })
  }

  if (password.length < 6) {
    return apiResponse({ success: false, error: 'passwordTooShort' })
  }

  if (!firstName || !lastName) {
    return apiResponse({ success: false, error: 'missingFields' })
  }

  const existing = await User.where('email', email).first()

  if (existing) {
    return apiResponse({ success: false, error: 'emailAlreadyRegistered' })
  }

  const user = new User()

  user.email = email
  user.passwordHash = await bcrypt.hash(password, 10)
  user.firstName = firstName
  user.lastName = lastName
  user.nickname = null
  user.profile = null
  await user.save()

  return apiResponse({ success: true, id: user.id })
}

/** GET /api/users?q= — searches users by name, nickname or email (partner selection). */
export const GET = withAuth(async (request, context, userId) => {
  const query = request.nextUrl.searchParams.get('q') ?? ''
  const normalized = query.trim()

  if (normalized.length < 2) {
    return NextResponse.json({ users: [] })
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
  const users: UserDto[] = rows.map((row: any) => ({
    id: Number(row.id),
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    nickname: row.nickname,
    displayName: getUserDisplayName(row),
    avatarUrl: getGravatarUrl(row.email, 80)
  }))

  return NextResponse.json({ users })
})
