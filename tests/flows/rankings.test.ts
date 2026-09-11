import { DB } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import { getRankings } from '@/app/(protected)/(rankings)/services/rankings'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { withOrganization } from '@/app/services/organization-context'
import { createCategory, createOrganization, createUser, resetDatabase } from '@/tests/setup/harness'

const ORGANIZATION_ID = 1
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The public rankings board.
 *
 * Worth covering for two reasons. It had no tests at all, and it used to read
 * every ranking row of the organization and group them in JavaScript — so the
 * rewrite that moved the aggregation into SQL needed something to hold its
 * behaviour still: what counts towards a player's total, what each filter
 * means, and who appears on the board at all.
 *
 * The ordering deliberately stayed in JavaScript (`displayName` is a computed
 * getter, and localeCompare sorts Spanish names better than either engine's
 * collation would), so the tie-break is asserted here too.
 */
describe('getRankings', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /** A player with a name, so the board's ordering by displayName is observable. */
  async function createPlayer(firstName: string, organizationId = ORGANIZATION_ID): Promise<number> {
    const id = await createUser(organizationId, Role.PLAYER)
    const user = (await User.withoutGlobalScopes().find(id))!

    user.firstName = firstName
    user.lastName = 'Tester'
    await user.save()

    return id
  }

  /** Grants ranking points directly, so the category and the expiry can be placed anywhere. */
  async function grant(
    userId: number,
    points: number,
    {
      categoryId = null,
      expiresInDays = 365,
      organizationId = ORGANIZATION_ID
    }: { categoryId?: number | null; expiresInDays?: number; organizationId?: number } = {}
  ): Promise<void> {
    await DB.table('rankings').insert({
      organizationId,
      categoryId,
      userId,
      points,
      expirationDate: new Date(Date.now() + expiresInDays * DAY_MS),
      createdAt: new Date()
    })
  }

  it('sums every still-valid award of a player into one row', async () => {
    const player = await createPlayer('Ada')

    await grant(player, 120)
    await grant(player, 80)

    const { data, total } = await getRankings()

    expect(total).toBe(1)
    expect(data[0]).toMatchObject({ userId: player, displayName: 'Ada Tester', points: 200 })
  })

  it('leaves expired awards out of the total', async () => {
    const player = await createPlayer('Ada')

    await grant(player, 120)
    await grant(player, 500, { expiresInDays: -1 })

    expect((await getRankings()).data[0].points).toBe(120)
  })

  it('drops a player whose awards have all expired', async () => {
    const player = await createPlayer('Ada')

    await grant(player, 500, { expiresInDays: -1 })

    expect((await getRankings()).total).toBe(0)
  })

  it('shows only the organization in context', async () => {
    const otherOrganizationId = await createOrganization()
    const mine = await createPlayer('Ada')
    const theirs = await createPlayer('Grace', otherOrganizationId)

    await grant(mine, 100)
    await grant(theirs, 9000, { organizationId: otherOrganizationId })

    expect((await getRankings()).data.map((entry) => entry.userId)).toEqual([mine])
    expect(
      (await withOrganization(otherOrganizationId, () => getRankings())).data.map((entry) => entry.userId)
    ).toEqual([theirs])
  })

  it('orders by points, then by name', async () => {
    const leader = await createPlayer('Zoe')
    const tiedB = await createPlayer('Bruno')
    const tiedA = await createPlayer('Ana')

    await grant(leader, 300)
    await grant(tiedB, 100)
    await grant(tiedA, 100)

    expect((await getRankings()).data.map((entry) => entry.displayName)).toEqual([
      'Zoe Tester',
      'Ana Tester',
      'Bruno Tester'
    ])
  })

  it('keeps a deactivated player off the board', async () => {
    const active = await createPlayer('Ada')
    const banned = await createPlayer('Grace')

    await grant(active, 100)
    await grant(banned, 9000)

    const user = (await User.withoutGlobalScopes().find(banned))!

    user.active = false
    await user.save()

    expect((await getRankings()).data.map((entry) => entry.userId)).toEqual([active])
  })

  describe('filters', () => {
    it('restricts the board to a single category', async () => {
      const primera = await createCategory(ORGANIZATION_ID, 'Primera')
      const cuarta = await createCategory(ORGANIZATION_ID, 'Cuarta')
      const player = await createPlayer('Ada')

      await grant(player, 100, { categoryId: primera })
      await grant(player, 900, { categoryId: cuarta })

      expect((await getRankings({ categoryId: primera })).data[0].points).toBe(100)
    })

    it('adds up every category of a discipline', async () => {
      const padelA = await createCategory(ORGANIZATION_ID, 'Primera', Discipline.PADEL)
      const padelB = await createCategory(ORGANIZATION_ID, 'Cuarta', Discipline.PADEL)
      const tennis = await createCategory(ORGANIZATION_ID, 'Primera Tenis', Discipline.TENNIS)
      const player = await createPlayer('Ada')

      await grant(player, 100, { categoryId: padelA })
      await grant(player, 50, { categoryId: padelB })
      await grant(player, 900, { categoryId: tennis })

      expect((await getRankings({ discipline: Discipline.PADEL })).data[0].points).toBe(150)
    })

    // A tournament that defined no categories awards points with categoryId
    // null: those belong to no discipline's board.
    it('leaves category-less awards out of a discipline board', async () => {
      const padel = await createCategory(ORGANIZATION_ID, 'Primera', Discipline.PADEL)
      const player = await createPlayer('Ada')

      await grant(player, 100, { categoryId: padel })
      await grant(player, 900, { categoryId: null })

      expect((await getRankings({ discipline: Discipline.PADEL })).data[0].points).toBe(100)
      // With no filter at all, both count.
      expect((await getRankings()).data[0].points).toBe(1000)
    })

    it('returns an empty board for a discipline with no categories', async () => {
      const player = await createPlayer('Ada')

      await grant(player, 100)

      const { data, total, from, to } = await getRankings({ discipline: Discipline.TENNIS })

      expect(data).toEqual([])
      expect(total).toBe(0)
      expect(from).toBeNull()
      expect(to).toBeNull()
    })

    it('does not reach a category of another organization', async () => {
      const otherOrganizationId = await createOrganization()
      const foreignCategory = await createCategory(otherOrganizationId, 'Primera')
      const player = await createPlayer('Ada')

      await grant(player, 100, { categoryId: foreignCategory })

      expect((await getRankings({ discipline: Discipline.PADEL })).total).toBe(0)
    })
  })

  describe('pagination', () => {
    it('reports the page metadata', async () => {
      for (const [index, name] of ['Ana', 'Bruno', 'Carla'].entries()) {
        await grant(await createPlayer(name), 300 - index)
      }

      const page = await getRankings({ page: 2, pageSize: 2 })

      expect(page.data.map((entry) => entry.displayName)).toEqual(['Carla Tester'])
      expect(page).toMatchObject({ total: 3, lastPage: 2, currrentPage: 2, perPage: 2, from: 3, to: 3 })
    })

    it('clamps a page beyond the last one', async () => {
      await grant(await createPlayer('Ana'), 100)

      expect((await getRankings({ page: 99, pageSize: 20 })).currrentPage).toBe(1)
    })
  })
})
