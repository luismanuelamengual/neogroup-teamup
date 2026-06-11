'use server'

import { Entities } from '@neogroup/neorm'
import { revalidatePath } from 'next/cache'
import { Competitor } from '@/app/_models/Competitor'
import { toMatchDto } from '@/app/_models/dtos'
import { Match } from '@/app/_models/Match'
import { Round } from '@/app/_models/Round'
import { Tournament } from '@/app/_models/Tournament'
import {
  DEFAULT_AMERICANO_SETTINGS,
  DEFAULT_LEAGUE_SETTINGS,
  Discipline,
  MatchScore,
  ScoreFormat,
  TournamentSettings,
  TournamentType
} from '@/app/_models/types'
import { getScoreWinner, isValidScore } from '@/app/_utils/score'
import { generateRoundPairings, getTotalRounds } from '@/app/_utils/tournament-engine'
import { auth } from '@/auth'

export interface ActionResult {
  success: boolean
  error?: string
  id?: number
}

export interface CreateTournamentInput {
  name: string
  description: string
  discipline: Discipline
  type: TournamentType
  scoreFormat: ScoreFormat
  startDate: string
  location: string
  maxCompetitors: number
  settings: TournamentSettings
}

export interface UpdateTournamentInput {
  name: string
  description: string
  location: string
  startDate: string
  maxCompetitors: number
}

async function requireUserId(): Promise<number | null> {
  const session = await auth()

  return session?.user?.id ? Number(session.user.id) : null
}

async function requireOwnedTournament(tournamentId: number, userId: number): Promise<Tournament | null> {
  const tournament: Tournament | null = await Tournament.find(tournamentId)

  if (!tournament || tournament.ownerId !== userId) {
    return null
  }

  return tournament
}

function revalidateTournamentPaths(tournamentId: number): void {
  revalidatePath('/organizer/tournaments')
  revalidatePath(`/organizer/tournaments/${tournamentId}`)
  revalidatePath('/player/tournaments')
  revalidatePath(`/player/tournaments/${tournamentId}`)
}

/** Creates a new tournament in stand_by status. */
export async function createTournament(input: CreateTournamentInput): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const name = input.name.trim()

  if (!name) {
    return { success: false, error: 'missingFields' }
  }

  if (!input.startDate || !input.maxCompetitors || input.maxCompetitors < 2) {
    return { success: false, error: 'missingFields' }
  }

  if (input.type === 'americano' && input.discipline !== 'padel') {
    return { success: false, error: 'americanoOnlyPadel' }
  }

  let settings: TournamentSettings = {}

  if (input.type === 'league') {
    settings = { ...DEFAULT_LEAGUE_SETTINGS, ...input.settings }
  } else if (input.type === 'americano') {
    settings = { ...DEFAULT_AMERICANO_SETTINGS, ...input.settings }
  }

  const tournament = new Tournament()

  tournament.ownerId = userId
  tournament.name = name
  tournament.description = input.description.trim() || null
  tournament.status = 'stand_by'
  tournament.discipline = input.discipline
  tournament.type = input.type
  tournament.scoreFormat = input.scoreFormat
  tournament.startDate = input.startDate
  tournament.location = input.location.trim() || null
  tournament.maxCompetitors = input.maxCompetitors
  tournament.settings = settings
  tournament.currentRound = 0
  tournament.createdAt = new Date()
  tournament.updatedAt = new Date()
  await Entities.save(tournament)
  revalidatePath('/organizer/tournaments')

  return { success: true, id: tournament.id }
}

/** Updates the editable attributes of a tournament. */
export async function updateTournament(tournamentId: number, input: UpdateTournamentInput): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament) {
    return { success: false, error: 'notFound' }
  }

  const name = input.name.trim()

  if (!name || !input.startDate || input.maxCompetitors < 2) {
    return { success: false, error: 'missingFields' }
  }

  tournament.name = name
  tournament.description = input.description.trim() || null
  tournament.location = input.location.trim() || null
  tournament.startDate = input.startDate
  tournament.maxCompetitors = input.maxCompetitors
  tournament.updatedAt = new Date()
  await Entities.save(tournament)
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

async function createRound(tournament: Tournament, roundNumber: number): Promise<ActionResult> {
  const competitors = await Competitor.where('tournamentId', tournament.id).orderBy('id').get()
  const competitorIds: number[] = competitors.map((competitor: any) => competitor.id)

  if (competitorIds.length < 2) {
    return { success: false, error: 'notEnoughCompetitors' }
  }

  let previousRoundMatches: Match[] = []

  if (roundNumber > 1) {
    const previousRound: Round | null = await Round.where('tournamentId', tournament.id)
      .where('number', roundNumber - 1)
      .first()

    if (previousRound) {
      previousRoundMatches = await Match.where('roundId', previousRound.id).get()
    }
  }

  const pairings = generateRoundPairings(
    tournament.type,
    tournament.settings ?? {},
    competitorIds,
    roundNumber,
    previousRoundMatches.map(toMatchDto)
  )

  if (pairings.length === 0) {
    return { success: false, error: 'noMatchesGenerated' }
  }

  const round = new Round()

  round.tournamentId = tournament.id
  round.number = roundNumber
  round.status = 'open'
  round.createdAt = new Date()
  await Entities.save(round)

  for (const pairing of pairings) {
    const match = new Match()

    match.tournamentId = tournament.id
    match.roundId = round.id
    match.position = pairing.position
    match.homeCompetitorIds = pairing.home
    match.awayCompetitorIds = pairing.away
    match.score = null

    // Byes (playoff only) are stored as already resolved in favor of "home".
    if (pairing.away === null) {
      match.status = 'walkover'
      match.winner = 'home'
    } else {
      match.status = 'pending'
      match.winner = null
    }

    match.createdAt = new Date()
    match.updatedAt = new Date()
    await Entities.save(match)
  }

  tournament.currentRound = roundNumber
  tournament.updatedAt = new Date()
  await Entities.save(tournament)

  return { success: true }
}

/** Starts the tournament: sets it ongoing and generates the first round. */
export async function startTournament(tournamentId: number): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament) {
    return { success: false, error: 'notFound' }
  }

  if (tournament.status !== 'stand_by') {
    return { success: false, error: 'invalidStatus' }
  }

  tournament.status = 'ongoing'
  const result = await createRound(tournament, 1)

  if (!result.success) {
    return result
  }

  await Entities.save(tournament)
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

/** Closes the current round once every match has a result. */
export async function closeCurrentRound(tournamentId: number): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== 'ongoing') {
    return { success: false, error: 'invalidStatus' }
  }

  const round: Round | null = await Round.where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!round || round.status !== 'open') {
    return { success: false, error: 'invalidStatus' }
  }

  const pendingMatches = await Match.where('roundId', round.id).where('status', 'pending').get()

  if (pendingMatches.length > 0) {
    return { success: false, error: 'pendingMatches' }
  }

  round.status = 'closed'
  await Entities.save(round)
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

/** Starts the next round (the current one must be closed). */
export async function startNextRound(tournamentId: number): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== 'ongoing') {
    return { success: false, error: 'invalidStatus' }
  }

  const currentRound: Round | null = await Round.where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!currentRound || currentRound.status !== 'closed') {
    return { success: false, error: 'roundStillOpen' }
  }

  const competitorsCount = (await Competitor.where('tournamentId', tournamentId).get()).length
  const totalRounds = getTotalRounds(tournament.type, tournament.settings ?? {}, competitorsCount)

  if (tournament.currentRound >= totalRounds) {
    return { success: false, error: 'noMoreRounds' }
  }

  const result = await createRound(tournament, tournament.currentRound + 1)

  if (!result.success) {
    return result
  }

  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

/** Marks the tournament as finished. */
export async function finishTournament(tournamentId: number): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== 'ongoing') {
    return { success: false, error: 'invalidStatus' }
  }

  tournament.status = 'finished'
  tournament.updatedAt = new Date()
  await Entities.save(tournament)
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

/**
 * Saves (or edits) a match result. Allowed for the tournament owner and for
 * players taking part in the match, while the match round is open.
 */
export async function saveMatchResult(matchId: number, score: MatchScore): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const match: Match | null = await Match.find(matchId)

  if (!match || !match.awayCompetitorIds) {
    return { success: false, error: 'notFound' }
  }

  const tournament: Tournament | null = await Tournament.find(match.tournamentId)

  if (!tournament || tournament.status !== 'ongoing') {
    return { success: false, error: 'invalidStatus' }
  }

  const round: Round | null = await Round.find(match.roundId)

  if (!round || round.status !== 'open') {
    return { success: false, error: 'roundClosed' }
  }

  const isOwner = tournament.ownerId === userId

  if (!isOwner) {
    const competitorIds = [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]
    const participants = await Competitor.whereIn('id', competitorIds).get()
    const isParticipant = participants.some(
      (competitor: any) => competitor.userId === userId || competitor.partnerUserId === userId
    )

    if (!isParticipant) {
      return { success: false, error: 'unauthorized' }
    }
  }

  if (!isValidScore(score, tournament.scoreFormat)) {
    return { success: false, error: 'invalidScore' }
  }

  if (score.walkover) {
    match.score = { walkover: score.walkover }
    match.status = 'walkover'
    match.winner = score.walkover
  } else {
    match.score = score
    match.status = 'played'
    match.winner = getScoreWinner(score, tournament.scoreFormat)
  }

  match.updatedAt = new Date()
  await Entities.save(match)
  revalidateTournamentPaths(tournament.id)

  return { success: true }
}
