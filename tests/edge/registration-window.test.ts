import { beforeEach, describe, expect, it } from 'vitest'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { resolveRegistration } from '@/app/(protected)/(tournaments)/services/registrations'
import { isRegistrationOpen } from '@/app/(protected)/(tournaments)/utils/tournaments'
import { buildTournament, createUser, resetDatabase } from '@/tests/setup/harness'

/** "YYYY-MM-DD" `days` from today (UTC), with enough margin to absorb any org timezone offset. */
function dateOffset(days: number): string {
  const date = new Date()

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

describe('startInscriptionsDate — gating tournament registration', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('isRegistrationOpen: null startInscriptionsDate is always open', () => {
    const tournament = new Tournament()

    tournament.startInscriptionsDate = null
    expect(isRegistrationOpen(tournament)).toBe(true)
  })

  it('isRegistrationOpen: closed before the date, open from it on', () => {
    const tournament = new Tournament()

    tournament.startInscriptionsDate = dateOffset(3)
    expect(isRegistrationOpen(tournament, 'UTC', new Date())).toBe(false)

    tournament.startInscriptionsDate = dateOffset(-3)
    expect(isRegistrationOpen(tournament, 'UTC', new Date())).toBe(true)
  })

  it('resolveRegistration rejects a join attempt before startInscriptionsDate', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      discipline: Discipline.TENNIS,
      subDiscipline: SubDiscipline.SINGLES,
      competitors: 0,
      startInscriptionsDate: dateOffset(3)
    })
    const tournament = await Tournament.withoutGlobalScopes()
      .where('id', built.tournament.id)
      .with('categories', 'competitors')
      .first()
    const playerId = await createUser(built.tournament.organizationId)

    await expect(resolveRegistration(tournament!, playerId, {})).rejects.toThrow(
      'Las inscripciones a este torneo todavía no están abiertas'
    )
  })

  it('resolveRegistration allows a join attempt once startInscriptionsDate has passed', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      discipline: Discipline.TENNIS,
      subDiscipline: SubDiscipline.SINGLES,
      competitors: 0,
      startInscriptionsDate: dateOffset(-3)
    })
    const tournament = await Tournament.withoutGlobalScopes()
      .where('id', built.tournament.id)
      .with('categories', 'competitors')
      .first()
    const playerId = await createUser(built.tournament.organizationId)
    const { playerIds } = await resolveRegistration(tournament!, playerId, {})

    expect(playerIds).toEqual([playerId])
  })
})
