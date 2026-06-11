'use server'

import { DB } from '@neogroup/neorm'
import { revalidatePath } from 'next/cache'
import { Competitor } from '@/app/_models/Competitor'
import { getUserDisplayName, UserDto } from '@/app/_models/dtos'
import { Tournament } from '@/app/_models/Tournament'
import { registersAsPairs } from '@/app/_models/types'
import { User } from '@/app/_models/User'
import { getGravatarUrl } from '@/app/_utils/gravatar'
import { auth } from '@/auth'

export interface ActionResult {
  success: boolean
  error?: string
}

export interface JoinTournamentInput {
  partnerUserId?: number | null
  partnerName?: string | null
}

async function requireUserId(): Promise<number | null> {
  const session = await auth()

  return session?.user?.id ? Number(session.user.id) : null
}

function revalidateTournamentPaths(tournamentId: number): void {
  revalidatePath('/player/tournaments')
  revalidatePath(`/player/tournaments/${tournamentId}`)
  revalidatePath(`/organizer/tournaments/${tournamentId}`)
}

/** Searches platform users by name, nickname or email (for partner selection). */
export async function searchUsers(query: string): Promise<UserDto[]> {
  const userId = await requireUserId()

  if (!userId) {
    return []
  }

  const normalized = query.trim()

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

  return rows.map((row: any) => ({
    id: Number(row.id),
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    nickname: row.nickname,
    displayName: getUserDisplayName(row),
    avatarUrl: getGravatarUrl(row.email, 80)
  }))
}

/** Registers the signed-in user (optionally with a partner) into a tournament. */
export async function joinTournament(tournamentId: number, input: JoinTournamentInput): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament: Tournament | null = await Tournament.find(tournamentId)

  if (!tournament) {
    return { success: false, error: 'notFound' }
  }

  if (tournament.status !== 'stand_by') {
    return { success: false, error: 'registrationClosed' }
  }

  const competitors = await Competitor.where('tournamentId', tournamentId).get()

  if (competitors.length >= tournament.maxCompetitors) {
    return { success: false, error: 'tournamentFull' }
  }

  const alreadyRegistered = competitors.some(
    (competitor: any) =>
      competitor.userId === userId ||
      competitor.partnerUserId === userId ||
      (input.partnerUserId &&
        (competitor.userId === input.partnerUserId || competitor.partnerUserId === input.partnerUserId))
  )

  if (alreadyRegistered) {
    return { success: false, error: 'alreadyRegistered' }
  }

  const user = await User.find(userId)

  if (!user) {
    return { success: false, error: 'unauthorized' }
  }

  const needsPartner = registersAsPairs(tournament.discipline, tournament.type, tournament.settings ?? {})
  let partnerUserId: number | null = null
  let partnerName: string | null = null
  let partnerDisplayName = ''

  if (needsPartner) {
    if (input.partnerUserId) {
      const partner = await User.find(input.partnerUserId)

      if (!partner) {
        return { success: false, error: 'partnerNotFound' }
      }

      partnerUserId = partner.id
      partnerDisplayName = getUserDisplayName(partner)
    } else if (input.partnerName?.trim()) {
      partnerName = input.partnerName.trim()
      partnerDisplayName = partnerName
    } else {
      return { success: false, error: 'partnerRequired' }
    }
  }

  const competitor = new Competitor()

  competitor.tournamentId = tournamentId
  competitor.userId = userId
  competitor.partnerUserId = partnerUserId
  competitor.partnerName = partnerName
  competitor.displayName = needsPartner
    ? `${getUserDisplayName(user)} / ${partnerDisplayName}`
    : getUserDisplayName(user)
  competitor.createdAt = new Date()
  await competitor.save()
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

/** Removes the signed-in user registration while the tournament is in stand_by. */
export async function leaveTournament(tournamentId: number): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament: Tournament | null = await Tournament.find(tournamentId)

  if (!tournament) {
    return { success: false, error: 'notFound' }
  }

  if (tournament.status !== 'stand_by') {
    return { success: false, error: 'registrationClosed' }
  }

  const entry: Competitor | null = await Competitor.where('tournamentId', tournamentId).where('userId', userId).first()

  if (!entry) {
    return { success: false, error: 'notRegistered' }
  }

  await entry.delete()
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}
