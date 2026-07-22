import { beforeEach, describe, expect, it } from 'vitest'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { processTournaments } from '@/app/(protected)/(tournaments)/services/tournaments'
import { isTournamentStartDue } from '@/app/(protected)/(tournaments)/utils/tournaments'
import { Organization } from '@/app/models/Organization'
import { buildTournament, getTournamentStatus, resetDatabase } from '@/tests/setup/harness'

/** Minimal STAND_BY tournament with just the scheduling fields the check reads. */
function scheduled(startDate: string, startTime: string | null): Tournament {
  const tournament = new Tournament()

  tournament.startDate = startDate
  tournament.startTime = startTime

  return tournament
}

describe('isTournamentStartDue — gating by date, time AND organization timezone', () => {
  // A fixed reference instant: 2026-06-26 12:00 UTC.
  const now = new Date('2026-06-26T12:00:00Z')
  const BA = 'America/Argentina/Buenos_Aires' // UTC-3, no DST
  const KOLKATA = 'Asia/Kolkata' // UTC+5:30

  it('UTC: due at start of day when no startTime is set', () => {
    expect(isTournamentStartDue(scheduled('2026-06-26', null), 'UTC', now)).toBe(true)
    expect(isTournamentStartDue(scheduled('2026-06-25', null), 'UTC', now)).toBe(true)
  })

  it('UTC: respects the start time within the day', () => {
    expect(isTournamentStartDue(scheduled('2026-06-26', '10:00'), 'UTC', now)).toBe(true)
    expect(isTournamentStartDue(scheduled('2026-06-26', '12:00'), 'UTC', now)).toBe(true)
    expect(isTournamentStartDue(scheduled('2026-06-26', '20:00'), 'UTC', now)).toBe(false)
  })

  it('Buenos Aires (UTC-3): a local time is converted before comparing', () => {
    // 08:00 BA = 11:00 UTC ≤ 12:00 UTC → due.
    expect(isTournamentStartDue(scheduled('2026-06-26', '08:00'), BA, now)).toBe(true)
    // 10:00 BA = 13:00 UTC > 12:00 UTC → not due yet.
    expect(isTournamentStartDue(scheduled('2026-06-26', '10:00'), BA, now)).toBe(false)
  })

  it('Buenos Aires (UTC-3): date-only uses local midnight, not UTC midnight', () => {
    // 00:00 BA on the 26th = 03:00 UTC ≤ 12:00 UTC → due.
    expect(isTournamentStartDue(scheduled('2026-06-26', null), BA, now)).toBe(true)
    // 00:00 BA on the 27th = 03:00 UTC on the 27th > now → not due.
    expect(isTournamentStartDue(scheduled('2026-06-27', null), BA, now)).toBe(false)
  })

  it('Kolkata (UTC+5:30): a zone ahead of UTC is handled too', () => {
    // 17:00 IST = 11:30 UTC ≤ 12:00 UTC → due.
    expect(isTournamentStartDue(scheduled('2026-06-26', '17:00'), KOLKATA, now)).toBe(true)
    // 18:00 IST = 12:30 UTC > 12:00 UTC → not due.
    expect(isTournamentStartDue(scheduled('2026-06-26', '18:00'), KOLKATA, now)).toBe(false)
  })

  it('is due for a past date regardless of the (later) local time', () => {
    expect(isTournamentStartDue(scheduled('2026-06-25', '23:59'), BA, now)).toBe(true)
  })

  it('falls back gracefully when startTime / timezone are unusable', () => {
    expect(isTournamentStartDue(scheduled('2026-06-26', 'not-a-time'), BA, now)).toBe(true)
    // Unknown timezone → treated as UTC: 20:00 UTC > 12:00 UTC → not due.
    expect(isTournamentStartDue(scheduled('2026-06-26', '20:00'), 'Mars/Olympus', now)).toBe(false)
  })
})

describe('processTournaments — starts tournaments at the organization local time', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('starts a tournament whose local start instant has passed, and skips one still upcoming', async () => {
    // Organization 1 (seeded by the migration) operates in Buenos Aires time.
    const org = await Organization.find(1)

    org!.timezone = 'America/Argentina/Buenos_Aires'
    await org!.save()

    const now = new Date('2026-06-26T12:00:00Z') // = 09:00 in Buenos Aires
    // Due: 08:00 BA = 11:00 UTC, already passed at `now`.
    const due = await buildTournament({ type: TournamentType.AMERICANO, competitors: 4, startDate: '2026-06-26' })

    due.tournament.startTime = '08:00'
    await due.tournament.save()

    // Upcoming: 10:00 BA = 13:00 UTC, still in the future at `now`.
    const upcoming = await buildTournament({ type: TournamentType.AMERICANO, competitors: 4, startDate: '2026-06-26' })

    upcoming.tournament.startTime = '10:00'
    await upcoming.tournament.save()

    const result = await processTournaments(now)

    expect(result.started).toContain(due.tournament.id)
    expect(result.started).not.toContain(upcoming.tournament.id)
    expect(await getTournamentStatus(due.tournament.id)).toBe(TournamentStatus.ONGOING)
    expect(await getTournamentStatus(upcoming.tournament.id)).toBe(TournamentStatus.STAND_BY)
  })
})
