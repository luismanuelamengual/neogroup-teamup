import { DB } from '@neogroup/neorm'
import { awardRankingPoints } from '@/app/(protected)/(rankings)/services/rankings'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import {
  createRound,
  deactivateTournamentRounds,
  isTournamentComplete
} from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import {
  autoAssignPreclassification,
  supportsPreclassification
} from '@/app/(protected)/(tournaments)/utils/preclassification'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { Competitor } from '../models/Competitor'
import { TournamentCategory } from '../models/TournamentCategory'

export interface TournamentOptions {
  id?: number
  name?: string
  ownerId?: number
  playerId?: number
  statuses?: TournamentStatus[]
  withCompetitors?: boolean
  withRounds?: boolean
  withMatches?: boolean
  page?: number
  pageSize?: number
}

export async function getTournaments({
  id,
  ownerId,
  playerId,
  name,
  statuses,
  withCompetitors = false,
  withRounds = false,
  withMatches = false,
  page = 1,
  pageSize = 10
}: TournamentOptions = {}): Promise<PaginatedResponse<Tournament[]>> {
  const result = await Tournament.when(id, (query) => query.where('id', id))
    .with('categories', 'categories.category')
    .when(ownerId, (query) => query.where('ownerId', ownerId))
    .when(playerId, (query) =>
      query.whereHas('competitors', (q) =>
        q.where((q) => q.where('userId', playerId).orWhere('partnerUserId', playerId))
      )
    )
    .when(name, (query) => query.whereLike('name', '%' + name + '%'))
    .when(statuses?.length, (query) => query.whereIn('status', statuses!))
    .when(withCompetitors, (query) => query.with('competitors', 'competitors.user', 'competitors.partnerUser'))
    .when(withRounds, (query) => query.with('rounds'))
    .when(withMatches, (query) => query.with('matches'))
    .orderBy('status')
    .orderByDesc('id')
    .paginate(pageSize, page)

  return result
}

export async function getTournament(options: TournamentOptions = {}): Promise<Tournament | null> {
  const {
    data: [tournament = null]
  } = await getTournaments({ ...options, pageSize: 1 })

  if (tournament) {
    if (tournament.competitors) {
      tournament.competitors = [...tournament.competitors].sort((a, b) => a.id - b.id)
    }

    if (tournament.rounds) {
      tournament.rounds = [...tournament.rounds].sort((a, b) => a.number - b.number)
    }

    if (tournament.matches) {
      tournament.matches = [...tournament.matches].sort((a, b) => a.roundId - b.roundId || a.position - b.position)
    }
  }

  return tournament
}

/**
 * Starts a tournament: removes empty category instances, auto-assigns
 * preclassification seeds from ranking (for bracket-style tournaments),
 * generates round 1, and marks the tournament as ongoing.
 */
export async function startTournament(tournament: Tournament): Promise<void> {
  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('invalidStatus')
  }

  // Everything that mutates the database is wrapped in a single transaction so the
  // whole start operation is atomic: if anything fails (or the serverless
  // function is killed mid-way, e.g. the Vercel cron 10s timeout), nothing is
  // committed and the tournament is left untouched in STAND_BY instead of in a
  // half-initialised state.
  await DB.transaction(async () => {
    // Remove real category instances that have no registered competitors.
    // The single category (categoryId = null) is always kept.
    const categories = await TournamentCategory.where('tournamentId', tournament.id).get()
    const realCategories = categories.filter((category) => category.categoryId != null)
    const allCompetitors = await Competitor.whereIn(
      'tournamentCategoryId',
      categories.map((category) => category.id)
    ).get()

    if (realCategories.length > 0) {
      const usedCategoryIds = new Set(allCompetitors.map((c) => c.tournamentCategoryId))

      for (const category of realCategories) {
        if (!usedCategoryIds.has(category.id)) {
          await category.delete()
        }
      }
    }

    // Auto-assign preclassification seeds from ranking when the tournament type
    // supports it (Playoff, Groups+Playoff, Playoff with consolation).
    if (supportsPreclassification(tournament.type)) {
      await autoAssignPreclassification(allCompetitors, tournament.organizationId)
    }

    tournament.status = TournamentStatus.ONGOING
    await createRound(tournament, 1)
    await tournament.save()
  })
}

/**
 * Finalises a tournament: marks it as finished, deactivates every (grace-window)
 * round and awards ranking points. Analogous to startTournament but for the
 * ONGOING → FINISHED transition.
 *
 * The whole operation runs in a single transaction so it is atomic: status
 * change, round deactivation and ranking awards are committed together or not at
 * all. This matters because finalisation can be triggered by the processTournaments
 * cron, whose 10s timeout on Vercel's Hobby plan could otherwise interrupt it and
 * leave the tournament FINISHED with only some of its ranking points awarded. If
 * the transaction is rolled back the tournament stays ONGOING, so the next cron
 * run simply retries it cleanly.
 */
export async function finishTournament(tournament: Tournament): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  await DB.transaction(async () => {
    tournament.status = TournamentStatus.FINISHED
    tournament.updatedAt = new Date()
    await tournament.save()
    await deactivateTournamentRounds(tournament)
    await awardRankingPoints(tournament.id)
  })
}

export async function deleteTournament(tournament: Tournament): Promise<boolean> {
  await tournament.delete()

  return true
}

export interface ProcessTournamentsResult {
  started: number[]
  startErrors: { id: number; error: string }[]
  finished: number[]
  finishedErrors: { id: number; error: string }[]
}

/**
 * Processes all tournaments across every organization:
 *  1. Starts every STAND_BY tournament whose startDate is today or in the past.
 *  2. Finishes every ONGOING tournament that has all rounds and matches completed.
 *
 * Intended to be called by the Vercel Cron Job endpoint.
 */
export async function processTournaments(): Promise<ProcessTournamentsResult> {
  const result: ProcessTournamentsResult = {
    started: [],
    startErrors: [],
    finished: [],
    finishedErrors: []
  }
  const today = new Date()

  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)
  // ── 1. Start overdue STAND_BY tournaments ────────────────────────────────
  const standByTournaments = await Tournament.withoutGlobalScopes()
    .where('status', TournamentStatus.STAND_BY)
    .where('startDate', '<=', todayStr)
    .get()

  for (const tournament of standByTournaments) {
    try {
      await startTournament(tournament)
      result.started.push(tournament.id)
      // eslint-disable-next-line no-console
      console.log(`[processTournaments] Started tournament ${tournament.id} (${tournament.name})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      result.startErrors.push({ id: tournament.id, error: message })
      // eslint-disable-next-line no-console
      console.error(`[processTournaments] Failed to start tournament ${tournament.id}:`, message)
    }
  }

  // ── 2. Finish completed ONGOING tournaments ──────────────────────────────
  const ongoingTournaments = await Tournament.withoutGlobalScopes().where('status', TournamentStatus.ONGOING).get()

  for (const tournament of ongoingTournaments) {
    try {
      if (await isTournamentComplete(tournament)) {
        await finishTournament(tournament)
        result.finished.push(tournament.id)
        // eslint-disable-next-line no-console
        console.log(`[processTournaments] Finished tournament ${tournament.id} (${tournament.name})`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      result.finishedErrors.push({ id: tournament.id, error: message })
      // eslint-disable-next-line no-console
      console.error(`[processTournaments] Failed to finish tournament ${tournament.id}:`, message)
    }
  }

  return result
}
