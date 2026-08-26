import { beforeEach, describe, expect, it } from 'vitest'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { clearMatchSchedule, setMatchSchedule } from '@/app/(protected)/(tournaments)/services/matches'
import { Role } from '@/app/models/Role'
import {
  buildTournament,
  BuiltTournament,
  createOrganization,
  createSite,
  createUser,
  getAllMatches,
  resetDatabase,
  start
} from '@/tests/setup/harness'

const ORGANIZATION_ID = 1

/**
 * Scheduling a match — where and when it is played — is written from the
 * tournament planner and is the only thing that touches matches.siteId / date /
 * hour / courtNumber. These tests cover the service the endpoint delegates to:
 * who may call it, what it accepts, and that unscheduling really empties the row
 * rather than leaving half a schedule behind.
 */
async function buildStartedTournament(): Promise<{ built: BuiltTournament; matchId: number }> {
  const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

  await start(built)

  const matches = await getAllMatches(built.categoryIds[0]!)

  return { built, matchId: matches[0]!.id }
}

async function reloadMatch(matchId: number): Promise<Match> {
  return (await Match.withoutGlobalScopes().where('id', matchId).first())!
}

const VALID_SCHEDULE = { date: '2026-08-12', hour: '18:30', courtNumber: 3 }

describe('match scheduling', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('stores the venue, day, time and court of a match', async () => {
    const { built, matchId } = await buildStartedTournament()
    const siteId = await createSite(ORGANIZATION_ID, 'Club Belgrano')

    await setMatchSchedule(matchId, { siteId, ...VALID_SCHEDULE }, built.ownerId, ORGANIZATION_ID)

    const match = await reloadMatch(matchId)

    expect(match.siteId).toBe(siteId)
    expect(match.date).toBe('2026-08-12')
    expect(match.hour).toBe('18:30')
    expect(match.courtNumber).toBe(3)
  })

  it('reschedules a match that was already planned', async () => {
    const { built, matchId } = await buildStartedTournament()
    const first = await createSite(ORGANIZATION_ID, 'Club Belgrano')
    const second = await createSite(ORGANIZATION_ID, 'GEBA')

    await setMatchSchedule(matchId, { siteId: first, ...VALID_SCHEDULE }, built.ownerId, ORGANIZATION_ID)
    await setMatchSchedule(
      matchId,
      { siteId: second, date: '2026-08-13', hour: '09:00', courtNumber: 1 },
      built.ownerId,
      ORGANIZATION_ID
    )

    const match = await reloadMatch(matchId)

    expect(match.siteId).toBe(second)
    expect(match.date).toBe('2026-08-13')
    expect(match.hour).toBe('09:00')
    expect(match.courtNumber).toBe(1)
  })

  it('does not alter the match status or result when scheduling it', async () => {
    const { built, matchId } = await buildStartedTournament()
    const siteId = await createSite(ORGANIZATION_ID)
    const before = await reloadMatch(matchId)

    await setMatchSchedule(matchId, { siteId, ...VALID_SCHEDULE }, built.ownerId, ORGANIZATION_ID)

    const after = await reloadMatch(matchId)

    // Planning a match says nothing about whether it has been played.
    expect(after.status).toBe(before.status)
    expect(after.score).toBe(before.score)
    expect(after.winner).toBe(before.winner)
  })

  it('clears every scheduling field when the match is unplanned', async () => {
    const { built, matchId } = await buildStartedTournament()
    const siteId = await createSite(ORGANIZATION_ID)

    await setMatchSchedule(matchId, { siteId, ...VALID_SCHEDULE }, built.ownerId, ORGANIZATION_ID)
    await clearMatchSchedule(matchId, built.ownerId, ORGANIZATION_ID)

    const match = await reloadMatch(matchId)

    expect(match.siteId).toBeNull()
    expect(match.date).toBeNull()
    expect(match.hour).toBeNull()
    expect(match.courtNumber).toBeNull()
  })

  it('rejects a venue that belongs to another organization', async () => {
    const { built, matchId } = await buildStartedTournament()
    const otherOrganizationId = await createOrganization()
    const foreignSiteId = await createSite(otherOrganizationId, 'Club Ajeno')

    await expect(
      setMatchSchedule(matchId, { siteId: foreignSiteId, ...VALID_SCHEDULE }, built.ownerId, ORGANIZATION_ID)
    ).rejects.toThrow('sede')
  })

  it('rejects a match of another organization', async () => {
    const { matchId } = await buildStartedTournament()
    const otherOrganizationId = await createOrganization()
    const outsiderId = await createUser(otherOrganizationId, Role.ORGANIZER)
    const siteId = await createSite(otherOrganizationId)

    await expect(
      setMatchSchedule(matchId, { siteId, ...VALID_SCHEDULE }, outsiderId, otherOrganizationId)
    ).rejects.toThrow('notFound')
  })

  it('rejects a caller who is not an organizer', async () => {
    const { matchId } = await buildStartedTournament()
    const playerId = await createUser(ORGANIZATION_ID, Role.PLAYER)
    const siteId = await createSite(ORGANIZATION_ID)

    // Unlike setMatchResult, there is no tournament setting that lets a player
    // move their own match around: planning is the organizer's job.
    await expect(setMatchSchedule(matchId, { siteId, ...VALID_SCHEDULE }, playerId, ORGANIZATION_ID)).rejects.toThrow(
      'unauthorized'
    )
    await expect(clearMatchSchedule(matchId, playerId, ORGANIZATION_ID)).rejects.toThrow('unauthorized')
  })

  it('rejects malformed dates, hours and court numbers', async () => {
    const { built, matchId } = await buildStartedTournament()
    const siteId = await createSite(ORGANIZATION_ID)
    const schedule = (overrides: Record<string, unknown>) => ({ siteId, ...VALID_SCHEDULE, ...overrides }) as never

    for (const date of ['12/08/2026', '2026-8-12', '2026-02-31', '']) {
      await expect(setMatchSchedule(matchId, schedule({ date }), built.ownerId, ORGANIZATION_ID)).rejects.toThrow(
        'invalidDate'
      )
    }

    for (const hour of ['24:00', '18:60', '8:30', '18.30']) {
      await expect(setMatchSchedule(matchId, schedule({ hour }), built.ownerId, ORGANIZATION_ID)).rejects.toThrow(
        'invalidHour'
      )
    }

    for (const courtNumber of [0, -1, 1.5]) {
      await expect(
        setMatchSchedule(matchId, schedule({ courtNumber }), built.ownerId, ORGANIZATION_ID)
      ).rejects.toThrow('invalidCourtNumber')
    }

    // Nothing was written by any of the rejected attempts.
    const match = await reloadMatch(matchId)

    expect(match.date).toBeNull()
    expect(match.siteId).toBeNull()
  })

  it('requires a venue', async () => {
    const { built, matchId } = await buildStartedTournament()

    await expect(
      setMatchSchedule(matchId, { siteId: null, ...VALID_SCHEDULE } as never, built.ownerId, ORGANIZATION_ID)
    ).rejects.toThrow('sede')
  })
})
