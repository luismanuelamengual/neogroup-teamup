'use server'

import { Entities } from '@neogroup/neorm'
import { revalidatePath } from 'next/cache'
import { CompetitorModel } from '@/app/_models/competitor.entity'
import { toMatchDto } from '@/app/_models/dtos'
import { Match, MatchModel } from '@/app/_models/match.entity'
import { Round, RoundModel } from '@/app/_models/round.entity'
import { Tournament, TournamentModel } from '@/app/_models/tournament.entity'
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
  const tournament: Tournament | null = await TournamentModel.find(tournamentId)

  if (!tournament || tournament.owner_id !== userId) {
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

  tournament.owner_id = userId
  tournament.name = name
  tournament.description = input.description.trim() || null
  tournament.status = 'stand_by'
  tournament.discipline = input.discipline
  tournament.type = input.type
  tournament.score_format = input.scoreFormat
  tournament.start_date = input.startDate
  tournament.location = input.location.trim() || null
  tournament.max_competitors = input.maxCompetitors
  tournament.settings = settings
  tournament.current_round = 0
  tournament.created_at = new Date()
  tournament.updated_at = new Date()
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
  tournament.start_date = input.startDate
  tournament.max_competitors = input.maxCompetitors
  tournament.updated_at = new Date()
  await Entities.save(tournament)
  revalidateTournamentPaths(tournamentId)

  return { success: true }
}

async function createRound(tournament: Tournament, roundNumber: number): Promise<ActionResult> {
  const competitors = await CompetitorModel.where('tournament_id', tournament.id).orderBy('id').get()
  const competitorIds: number[] = competitors.map((competitor: any) => competitor.id)

  if (competitorIds.length < 2) {
    return { success: false, error: 'notEnoughCompetitors' }
  }

  let previousRoundMatches: Match[] = []

  if (roundNumber > 1) {
    const previousRound: Round | null = await RoundModel.where('tournament_id', tournament.id)
      .where('number', roundNumber - 1)
      .first()

    if (previousRound) {
      previousRoundMatches = await MatchModel.where('round_id', previousRound.id).get()
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

  round.tournament_id = tournament.id
  round.number = roundNumber
  round.status = 'open'
  round.created_at = new Date()
  await Entities.save(round)

  for (const pairing of pairings) {
    const match = new Match()

    match.tournament_id = tournament.id
    match.round_id = round.id
    match.position = pairing.position
    match.home_competitor_ids = pairing.home
    match.away_competitor_ids = pairing.away
    match.score = null

    // Byes (playoff only) are stored as already resolved in favor of "home".
    if (pairing.away === null) {
      match.status = 'walkover'
      match.winner = 'home'
    } else {
      match.status = 'pending'
      match.winner = null
    }

    match.created_at = new Date()
    match.updated_at = new Date()
    await Entities.save(match)
  }

  tournament.current_round = roundNumber
  tournament.updated_at = new Date()
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

  const round: Round | null = await RoundModel.where('tournament_id', tournamentId)
    .where('number', tournament.current_round)
    .first()

  if (!round || round.status !== 'open') {
    return { success: false, error: 'invalidStatus' }
  }

  const pendingMatches = await MatchModel.where('round_id', round.id).where('status', 'pending').get()

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

  const currentRound: Round | null = await RoundModel.where('tournament_id', tournamentId)
    .where('number', tournament.current_round)
    .first()

  if (!currentRound || currentRound.status !== 'closed') {
    return { success: false, error: 'roundStillOpen' }
  }

  const competitorsCount = (await CompetitorModel.where('tournament_id', tournamentId).get()).length
  const totalRounds = getTotalRounds(tournament.type, tournament.settings ?? {}, competitorsCount)

  if (tournament.current_round >= totalRounds) {
    return { success: false, error: 'noMoreRounds' }
  }

  const result = await createRound(tournament, tournament.current_round + 1)

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
  tournament.updated_at = new Date()
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

  const match: Match | null = await MatchModel.find(matchId)

  if (!match || !match.away_competitor_ids) {
    return { success: false, error: 'notFound' }
  }

  const tournament: Tournament | null = await TournamentModel.find(match.tournament_id)

  if (!tournament || tournament.status !== 'ongoing') {
    return { success: false, error: 'invalidStatus' }
  }

  const round: Round | null = await RoundModel.find(match.round_id)

  if (!round || round.status !== 'open') {
    return { success: false, error: 'roundClosed' }
  }

  const isOwner = tournament.owner_id === userId

  if (!isOwner) {
    const competitorIds = [...match.home_competitor_ids, ...(match.away_competitor_ids ?? [])]
    const participants = await CompetitorModel.whereIn('id', competitorIds).get()
    const isParticipant = participants.some(
      (competitor: any) => competitor.user_id === userId || competitor.partner_user_id === userId
    )

    if (!isParticipant) {
      return { success: false, error: 'unauthorized' }
    }
  }

  if (!isValidScore(score, tournament.score_format)) {
    return { success: false, error: 'invalidScore' }
  }

  if (score.walkover) {
    match.score = { walkover: score.walkover }
    match.status = 'walkover'
    match.winner = score.walkover
  } else {
    match.score = score
    match.status = 'played'
    match.winner = getScoreWinner(score, tournament.score_format)
  }

  match.updated_at = new Date()
  await Entities.save(match)
  revalidateTournamentPaths(tournament.id)

  return { success: true }
}
