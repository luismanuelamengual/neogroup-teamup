import { beforeEach, describe, expect, it } from 'vitest'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  addTournamentCategory,
  loadManageableTournament,
  moveCompetitor,
  registerCompetitor,
  removeTournamentCategory,
  unregisterCompetitor
} from '@/app/(protected)/(tournaments)/services/administration'
import { buildTournament, createUser, resetDatabase } from '@/tests/setup/harness'

/** Reloads a tournament through the same gate the API routes use. */
function manageable(tournamentId: number, ownerId: number) {
  return loadManageableTournament(tournamentId, ownerId)
}

async function countInCategory(tournamentCategoryId: number): Promise<number> {
  return (await Competitor.where('tournamentCategoryId', tournamentCategoryId).get()).length
}

describe('tournament administration', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  describe('loadManageableTournament', () => {
    it('rejects a non-owner', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 2 })
      const stranger = await createUser(built.tournament.organizationId)

      await expect(manageable(built.tournament.id, stranger)).rejects.toThrow('No autorizado')
    })

    it('rejects a tournament that is not in stand_by', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 2 })

      built.tournament.status = TournamentStatus.ONGOING
      await built.tournament.save()

      await expect(manageable(built.tournament.id, built.ownerId)).rejects.toThrow('fase de inscripción')
    })
  })

  describe('categories', () => {
    it('adds a category and rejects duplicates', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [1, 1] })
      let tournament = await manageable(built.tournament.id, built.ownerId)

      await addTournamentCategory(tournament, tournament.organizationId, 'Cuarta', 8)

      const categories = await TournamentCategory.where('tournamentId', built.tournament.id).get()

      expect(categories).toHaveLength(3)

      tournament = await manageable(built.tournament.id, built.ownerId)
      await expect(addTournamentCategory(tournament, tournament.organizationId, 'cuarta', 8)).rejects.toThrow(
        'ya existe'
      )
    })

    it('removes an empty category but not one with competitors', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [2, 0] })
      const [full, empty] = built.categoryIds
      let tournament = await manageable(built.tournament.id, built.ownerId)

      await removeTournamentCategory(tournament, empty)
      expect(await TournamentCategory.where('tournamentId', built.tournament.id).get()).toHaveLength(1)

      tournament = await manageable(built.tournament.id, built.ownerId)
      await expect(removeTournamentCategory(tournament, full)).rejects.toThrow('al menos una categoría')
    })

    it('rejects removing a category that has competitors', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [2, 0] })
      const [full] = built.categoryIds
      const tournament = await manageable(built.tournament.id, built.ownerId)

      await expect(removeTournamentCategory(tournament, full)).rejects.toThrow('competidores inscriptos')
    })
  })

  describe('register competitor (free tournaments)', () => {
    it('registers a singles competitor', async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        discipline: Discipline.TENNIS,
        subDiscipline: SubDiscipline.SINGLES,
        competitors: 0
      })
      const player = await createUser(built.tournament.organizationId)
      const tournament = await manageable(built.tournament.id, built.ownerId)

      await registerCompetitor(tournament, built.categoryIds[0], player, null)

      expect(await countInCategory(built.categoryIds[0])).toBe(1)
    })

    it('rejects registering an already-registered player', async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        discipline: Discipline.TENNIS,
        subDiscipline: SubDiscipline.SINGLES,
        competitors: 0
      })
      const player = await createUser(built.tournament.organizationId)
      let tournament = await manageable(built.tournament.id, built.ownerId)

      await registerCompetitor(tournament, built.categoryIds[0], player, null)

      tournament = await manageable(built.tournament.id, built.ownerId)
      await expect(registerCompetitor(tournament, built.categoryIds[0], player, null)).rejects.toThrow('ya inscripto')
    })

    it('requires a partner for doubles disciplines', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, discipline: Discipline.PADEL, competitors: 0 })
      const player = await createUser(built.tournament.organizationId)
      const partner = await createUser(built.tournament.organizationId)
      let tournament = await manageable(built.tournament.id, built.ownerId)

      await expect(registerCompetitor(tournament, built.categoryIds[0], player, null)).rejects.toThrow(
        'compañero es requerido'
      )

      tournament = await manageable(built.tournament.id, built.ownerId)
      await registerCompetitor(tournament, built.categoryIds[0], player, partner)

      expect(await countInCategory(built.categoryIds[0])).toBe(1)
    })

    it('rejects registration on paid tournaments and when the category is full', async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        discipline: Discipline.TENNIS,
        subDiscipline: SubDiscipline.SINGLES,
        competitors: 0
      })

      // Force a paid tournament.
      built.tournament.paid = true
      built.tournament.entryFee = 1000
      await built.tournament.save()

      let tournament = await manageable(built.tournament.id, built.ownerId)
      const player = await createUser(built.tournament.organizationId)

      await expect(registerCompetitor(tournament, built.categoryIds[0], player, null)).rejects.toThrow('flujo de pago')

      // Back to free, but with a capacity of exactly 1.
      built.tournament.paid = false
      built.tournament.entryFee = null
      await built.tournament.save()
      const category = await TournamentCategory.find(built.categoryIds[0])

      category!.maxCompetitors = 1
      await category!.save()

      tournament = await manageable(built.tournament.id, built.ownerId)
      await registerCompetitor(tournament, built.categoryIds[0], player, null)

      const another = await createUser(built.tournament.organizationId)

      tournament = await manageable(built.tournament.id, built.ownerId)
      await expect(registerCompetitor(tournament, built.categoryIds[0], another, null)).rejects.toThrow('cupo máximo')
    })
  })

  describe('move and unregister competitor', () => {
    it('moves a competitor to another category', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [1, 0] })
      const [from, to] = built.categoryIds
      const competitorId = built.competitorIds[0]
      const tournament = await manageable(built.tournament.id, built.ownerId)

      await moveCompetitor(tournament, competitorId, to)

      expect(await countInCategory(from)).toBe(0)
      expect(await countInCategory(to)).toBe(1)
    })

    it('rejects moving into a full category', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [1, 1] })
      const [from, to] = built.categoryIds
      const target = await TournamentCategory.find(to)

      target!.maxCompetitors = 1
      await target!.save()

      const competitorId = built.competitorIds[0]
      const tournament = await manageable(built.tournament.id, built.ownerId)

      await expect(moveCompetitor(tournament, competitorId, to)).rejects.toThrow('cupo máximo')
      expect(await countInCategory(from)).toBe(1)
    })

    it('unregisters a competitor', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 3 })
      const tournament = await manageable(built.tournament.id, built.ownerId)

      await unregisterCompetitor(tournament, built.competitorIds[0])

      expect(await countInCategory(built.categoryIds[0])).toBe(2)
    })
  })
})
