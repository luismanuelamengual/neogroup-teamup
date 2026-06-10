'use server'

import { DB, Entities } from '@neogroup/neorm'
import { revalidatePath } from 'next/cache'
import { Competitor, CompetitorModel } from '@/app/_models/competitor.entity'
import { getUserDisplayName, UserDto } from '@/app/_models/dtos'
import { Tournament, TournamentModel } from '@/app/_models/tournament.entity'
import { registersAsPairs } from '@/app/_models/types'
import { UserModel } from '@/app/_models/user.entity'
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
    ? `SELECT id, email, first_name, last_name, nickname
       FROM users
       WHERE (first_name LIKE ? OR last_name LIKE ? OR nickname LIKE ? OR email LIKE ?) AND id <> ?
       ORDER BY first_name, last_name
       LIMIT 10`
    : `SELECT id, email, first_name, last_name, nickname
       FROM users
       WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR nickname ILIKE $1 OR email ILIKE $1) AND id <> $2
       ORDER BY first_name, last_name
       LIMIT 10`
  const bindings = isSqlite ? [pattern, pattern, pattern, pattern, userId] : [pattern, userId]
  const rows = await DB.query(sql, bindings)

  return rows.map((row: any) => ({
    id: Number(row.id),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
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

  const tournament: Tournament | null = await TournamentModel.find(tournamentId)

  if (!tournament) {
    return { success: false, error: 'notFound' }
  }

  if (tournament.status !== 'stand_by') {
    return { success: false, error: 'registrationClosed' }
  }

  const competitors = await CompetitorModel.where('tournament_id', tournamentId).get()

  if (competitors.length >= tournament.max_competitors) {
    return { success: false, error: 'tournamentFull' }
  }

  const alreadyRegistered = competitors.some(
    (competitor: any) =>
      competitor.user_id === userId ||
      competitor.partner_user_id === userId ||
      (input.partnerUserId &&
        (competitor.user_id === input.partnerUserId || competitor.partner_user_id === input.partnerUserId))
  )

  if (alreadyRegistered) {
    return { success: false, error: 'alreadyRegistered' }
  }

  const user = await UserModel.find(userId)

  if (!user) {
    return { success: false, error: 'unauthorized' }
  }

  const needsPartner = registersAsPairs(tournament.discipline, tournament.type, tournament.settings ?? {})
  let partnerUserId: number | null = null
  let partnerName: string | null = null
  let partnerDisplayName = ''

  if (needsPartner) {
    if (input.partnerUserId) {
      const partner = await UserModel.find(input.partnerUserId)

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

  competitor.tournament_id = tournamentId
  competitor.user_id = userId
  competitor.partner_user_id = partnerUserId
  competitor.partner_name = partnerName
  competitor.display_name = needsPartner
    ? `${getUserDisplayName(user)} / ${partnerDisplayName}`
    : getUserDisplayName(user)
  competitor.created_at = new Date()
  await Entities.save(competitor)
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

/** Removes the signed-in user registration while the tournament is in stand_by. */
export async function leaveTournament(tournamentId: number): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament: Tournament | null = await TournamentModel.find(tournamentId)

  if (!tournament) {
    return { success: false, error: 'notFound' }
  }

  if (tournament.status !== 'stand_by') {
    return { success: false, error: 'registrationClosed' }
  }

  const entry: Competitor | null = await CompetitorModel.where('tournament_id', tournamentId)
    .where('user_id', userId)
    .first()

  if (!entry) {
    return { success: false, error: 'notRegistered' }
  }

  await Entities.delete(entry)
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}
