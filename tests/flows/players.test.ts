import { beforeEach, describe, expect, it } from 'vitest'
import { getPlayers } from '@/app/(protected)/(tournaments)/services/players'
import { Role } from '@/app/models/Role'
import { createUser, resetDatabase } from '@/tests/setup/harness'

const ORGANIZATION_ID = 1

/**
 * `getPlayers` backs both the partner pickers (a search) and any screen that
 * only holds ids and needs the people behind them (the head-to-head header) —
 * the `ids` option is what turns the same query into a lookup.
 */
describe('getPlayers', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('restricts the result to the given ids', async () => {
    const [first, second, third] = await Promise.all([
      createUser(ORGANIZATION_ID, Role.PLAYER),
      createUser(ORGANIZATION_ID, Role.PLAYER),
      createUser(ORGANIZATION_ID, Role.PLAYER)
    ])
    const { data } = await getPlayers({ ids: [first!, third!] })

    expect(data.map((player) => player.id).sort()).toEqual([first, third].sort())
    expect(data.some((player) => player.id === second)).toBe(false)
  })

  it('returns nothing for an empty id list, rather than everybody', async () => {
    await createUser(ORGANIZATION_ID, Role.PLAYER)

    const { data } = await getPlayers({ ids: [] })

    expect(data).toEqual([])
  })

  it('stays paginated, so a caller wanting every id back sizes the page itself', async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => createUser(ORGANIZATION_ID, Role.PLAYER)))
    const capped = await getPlayers({ ids })
    const full = await getPlayers({ ids, pageSize: ids.length })

    // The default page is 10 — which is exactly why the head-to-head page
    // passes its own roster length.
    expect(capped.data).toHaveLength(10)
    expect(full.data).toHaveLength(ids.length)
  })

  it('never returns a password hash', async () => {
    const id = await createUser(ORGANIZATION_ID, Role.PLAYER)
    const { data } = await getPlayers({ ids: [id] })

    expect(data[0]!.passwordHash).toBeNull()
  })
})
