import { beforeEach, describe, expect, it } from 'vitest'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { setMatchResult } from '@/app/(protected)/(tournaments)/services/tournaments'
import { Role } from '@/app/models/Role'
import {
  buildTournament,
  createUser,
  getMatches,
  getRounds,
  homeWinScore,
  resetDatabase,
  start
} from '@/tests/setup/harness'

/**
 * setMatchResult's authorization has two independent layers:
 *  - Any user with the ORGANIZER role in the tournament's organization may
 *    always set a result, regardless of whether they created that specific
 *    tournament.
 *  - A non-organizer participant may only submit their own match result when
 *    the tournament opts in via `allowPlayerSetScore`; a non-participant is
 *    never allowed.
 */
describe('setMatchResult — permissions', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('rejects a participant when allowPlayerSetScore is false (the default)', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const round1 = (await getRounds(built.categoryIds[0])).find((r) => r.number === 1)!
    const match = (await getMatches(round1.id))[0]
    const participantId = built.rosterByCompetitorId.get(match.homeCompetitorIds[0])![0]

    await expect(setMatchResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT), participantId)).rejects.toThrow(
      'unauthorized'
    )
  })

  it('allows a participant when allowPlayerSetScore is true', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      allowPlayerSetScore: true
    })

    await start(built)

    const round1 = (await getRounds(built.categoryIds[0])).find((r) => r.number === 1)!
    const match = (await getMatches(round1.id))[0]
    const participantId = built.rosterByCompetitorId.get(match.homeCompetitorIds[0])![0]

    await expect(
      setMatchResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT), participantId)
    ).resolves.toBeUndefined()
  })

  it('always allows the tournament owner (an organizer), regardless of allowPlayerSetScore', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      allowPlayerSetScore: false
    })

    await start(built)

    const round1 = (await getRounds(built.categoryIds[0])).find((r) => r.number === 1)!
    const match = (await getMatches(round1.id))[0]

    await expect(
      setMatchResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT), built.ownerId)
    ).resolves.toBeUndefined()
  })

  it('allows any organizer of the organization, not just the tournament owner', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      allowPlayerSetScore: false
    })

    await start(built)

    const round1 = (await getRounds(built.categoryIds[0])).find((r) => r.number === 1)!
    const match = (await getMatches(round1.id))[0]
    // A different organizer in the same organization, unrelated to this tournament.
    const otherOrganizerId = await createUser(1, Role.ORGANIZER)

    await expect(
      setMatchResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT), otherOrganizerId)
    ).resolves.toBeUndefined()
  })

  it('rejects a non-organizer, non-participant user even if they happen to be the tournament owner field', async () => {
    // A PLAYER-role user with no roster in the match and no organizer role must
    // not be able to set a result, even when allowPlayerSetScore is true.
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      allowPlayerSetScore: true
    })

    await start(built)

    const round1 = (await getRounds(built.categoryIds[0])).find((r) => r.number === 1)!
    const match = (await getMatches(round1.id))[0]
    const nonOrganizerNonParticipant = await createUser(1, Role.PLAYER)

    await expect(
      setMatchResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT), nonOrganizerNonParticipant)
    ).rejects.toThrow('unauthorized')
  })

  it('always rejects a stranger with no roster in the match, even when allowPlayerSetScore is true', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      allowPlayerSetScore: true
    })

    await start(built)

    const round1 = (await getRounds(built.categoryIds[0])).find((r) => r.number === 1)!
    const match = (await getMatches(round1.id))[0]
    const strangerId = await createUser()

    await expect(setMatchResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT), strangerId)).rejects.toThrow(
      'unauthorized'
    )
  })
})
