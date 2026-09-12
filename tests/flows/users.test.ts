import { beforeEach, describe, expect, it } from 'vitest'
import { PasswordResetToken } from '@/app/(auth)/models/PasswordResetToken'
import { createSite } from '@/app/(protected)/(sites)/services/sites'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { CreateUserInput } from '@/app/(protected)/(users)/models/UserInput'
import {
  createUser,
  deleteUser,
  getUsers,
  resetUserPassword,
  updateUser
} from '@/app/(protected)/(users)/services/users'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { withOrganization } from '@/app/services/organization-context'
import { buildTournament, createOrganization, createUser as createRawUser, resetDatabase } from '@/tests/setup/harness'

const HOST = 'test.teamup.ar'

/**
 * Administration of the users of an organization.
 *
 * This module has no organizationId in any of its signatures: keeping one
 * organization's users out of another's is entirely the `OrganizationScope`'s
 * job, resolved from the organization in context (see
 * services/organization-context.ts). These tests are what holds that line, so
 * most of them build a second organization and check it stays unreachable.
 *
 * The other thing worth pinning down is the deliberate asymmetry of the scopes:
 * the listing drops `activeScope` and `emailVerifiedScope` on purpose — a
 * deactivated or unverified account is exactly what an administrator needs to
 * see and fix — while keeping the organization one. Losing that distinction in
 * either direction is a bug that nothing else would report.
 *
 * `createUser` emails an invitation; `sendEmail` is a no-op without
 * RESEND_API_KEY (it logs and returns), so what is observable here is the
 * PasswordResetToken it issues, which is asserted rather than mocked away.
 */
describe('users administration', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /** Payload for a user of the organization, with only the email varying. */
  const input = (email: string, overrides: Partial<CreateUserInput> = {}): CreateUserInput => ({
    email,
    firstName: 'Ada',
    lastName: 'Lovelace',
    roleId: Role.PLAYER,
    ...overrides
  })

  describe('creation', () => {
    it('creates a user in the organization in context', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)

      expect(user.organizationId).toBe(1)
      expect(user.email).toBe('ada@test.dev')
      expect(user.emailVerified).toBe(true)
      expect(user.active).toBe(true)
      // No password until the invitation is followed: credentials login finds
      // nothing to match in the meantime.
      expect(user.passwordHash).toBeNull()
    })

    it('issues an invitation token so the user can set a password', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)
      const tokens = await PasswordResetToken.where('userId', user.id).get()

      expect(tokens).toHaveLength(1)
      expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('lowercases and trims the email', async () => {
      const user = await createUser(input('  ADA@Test.dev  '), HOST)

      expect(user.email).toBe('ada@test.dev')
    })

    it('rejects a malformed email', async () => {
      await expect(createUser(input('not-an-email'), HOST)).rejects.toThrow('no es válido')
    })

    it('rejects a missing name', async () => {
      await expect(createUser(input('ada@test.dev', { firstName: '  ' }), HOST)).rejects.toThrow('obligatorios')
    })

    it('refuses to create an administrator', async () => {
      await expect(createUser(input('ada@test.dev', { roleId: Role.ADMINISTRATOR }), HOST)).rejects.toThrow(
        'no es válido'
      )
    })

    it('creates in whichever organization is in context', async () => {
      const user = await withOrganization(await createOrganization(), () => createUser(input('ada@test.dev'), HOST))

      expect(user.organizationId).not.toBe(1)
    })
  })

  describe('email uniqueness', () => {
    it('rejects an email already taken in the organization', async () => {
      await createUser(input('ada@test.dev'), HOST)

      await expect(createUser(input('ada@test.dev'), HOST)).rejects.toThrow('Ya existe')
    })

    it('rejects it regardless of casing', async () => {
      await createUser(input('ada@test.dev'), HOST)

      await expect(createUser(input('ADA@TEST.DEV'), HOST)).rejects.toThrow('Ya existe')
    })

    // Uniqueness is per organization, which is why normalizeEmail keeps the
    // OrganizationScope on and only drops the active/verified ones.
    it('lets two organizations use the same email', async () => {
      const otherOrganizationId = await createOrganization()

      await createUser(input('ada@test.dev'), HOST)

      const outsider = await withOrganization(otherOrganizationId, () => createUser(input('ada@test.dev'), HOST))

      expect(outsider.organizationId).toBe(otherOrganizationId)
    })

    it('counts an address held by a deactivated account as taken', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)

      await updateUser(user.id, { ...input('ada@test.dev'), active: false })

      await expect(createUser(input('ada@test.dev'), HOST)).rejects.toThrow('Ya existe')
    })

    it('lets a user keep its own email across an update', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)
      const updated = await updateUser(user.id, { ...input('ada@test.dev', { firstName: 'Grace' }), active: true })

      expect(updated.email).toBe('ada@test.dev')
      expect(updated.firstName).toBe('Grace')
    })
  })

  describe('listing', () => {
    it('lists the users of the organization in context only', async () => {
      const otherOrganizationId = await createOrganization()

      await createUser(input('mine@test.dev'), HOST)
      await withOrganization(otherOrganizationId, () => createUser(input('theirs@test.dev'), HOST))

      const { data } = await getUsers()

      expect(data.map((user) => user.email)).toEqual(['mine@test.dev'])
    })

    it('excludes administrators but keeps users with no role yet', async () => {
      await createRawUser(1, Role.ADMINISTRATOR)
      const roleless = await createRawUser(1, null)
      const { data } = await getUsers({ pageSize: 50 })

      expect(data.map((user) => user.id)).toEqual([roleless])
    })

    it('keeps deactivated and unverified accounts visible to the administrator', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)

      await updateUser(user.id, { ...input('ada@test.dev'), active: false })

      const { data } = await getUsers()

      expect(data.map((user) => user.id)).toEqual([user.id])
      expect(data[0].active).toBe(false)
    })

    it('never returns a password hash', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)

      user.passwordHash = 'a-hash'
      await user.save()

      const { data } = await getUsers()

      expect(data[0].passwordHash).toBeNull()
    })

    it('filters by role', async () => {
      await createUser(input('player@test.dev'), HOST)
      await createUser(input('organizer@test.dev', { roleId: Role.ORGANIZER }), HOST)

      const { data } = await getUsers({ roleId: Role.ORGANIZER })

      expect(data.map((user) => user.email)).toEqual(['organizer@test.dev'])
    })

    it('searches by name and by email, case-insensitively', async () => {
      await createUser(input('ada@test.dev', { firstName: 'Ada', lastName: 'Lovelace' }), HOST)
      await createUser(input('grace@test.dev', { firstName: 'Grace', lastName: 'Hopper' }), HOST)

      expect((await getUsers({ query: 'hopper' })).data.map((user) => user.email)).toEqual(['grace@test.dev'])
      expect((await getUsers({ query: 'ADA@' })).data.map((user) => user.email)).toEqual(['ada@test.dev'])
    })

    it('paginates', async () => {
      await createUser(input('a@test.dev', { firstName: 'Ana' }), HOST)
      await createUser(input('b@test.dev', { firstName: 'Bruno' }), HOST)
      await createUser(input('c@test.dev', { firstName: 'Carla' }), HOST)

      const page = await getUsers({ page: 2, pageSize: 2 })

      expect(page.total).toBe(3)
      expect(page.lastPage).toBe(2)
      expect(page.data.map((user) => user.firstName)).toEqual(['Carla'])
    })
  })

  describe('venue', () => {
    it('accepts a venue of the organization', async () => {
      const site = await createSite({ name: 'Club Belgrano' })
      const user = await createUser(input('ada@test.dev', { siteId: site.id }), HOST)

      expect(user.siteId).toBe(site.id)
    })

    it('rejects a venue of another organization', async () => {
      const otherOrganizationId = await createOrganization()
      const foreignSite = await withOrganization(otherOrganizationId, () => createSite({ name: 'Club Ajeno' }))

      await expect(createUser(input('ada@test.dev', { siteId: foreignSite.id }), HOST)).rejects.toThrow(
        'sede seleccionada no es válida'
      )
    })
  })

  describe('reaching another organization', () => {
    it('does not update, delete or reset a user of another organization', async () => {
      const otherOrganizationId = await createOrganization()
      const outsider = await withOrganization(otherOrganizationId, () => createUser(input('ada@test.dev'), HOST))

      await expect(updateUser(outsider.id, { ...input('otra@test.dev'), active: true })).rejects.toThrow(
        'no encontrado'
      )
      await expect(deleteUser(outsider.id)).rejects.toThrow('no encontrado')
      await expect(resetUserPassword(outsider.id, HOST)).rejects.toThrow('no encontrado')
    })

    it('does not reach the administrators of its own organization either', async () => {
      const administrator = await createRawUser(1, Role.ADMINISTRATOR)

      await expect(deleteUser(administrator)).rejects.toThrow('no encontrado')
    })
  })

  describe('deletion', () => {
    it('deletes a user with no history', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)

      await deleteUser(user.id)

      expect(await User.withoutGlobalScopes().where('id', user.id).first()).toBeNull()
    })

    it('refuses to delete a user that owns a tournament', async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        competitors: 4,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await expect(deleteUser(built.ownerId)).rejects.toThrow('actividad registrada')
    })

    it('refuses to delete a player registered in a tournament', async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        competitors: 4,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })
      const player = built.rosterByCompetitorId.get(built.competitorIds[0]!)![0]!

      await expect(deleteUser(player)).rejects.toThrow('actividad registrada')
    })
  })

  describe('password reset', () => {
    it('replaces any previous token, so only one link is ever valid', async () => {
      const user = await createUser(input('ada@test.dev'), HOST)

      await resetUserPassword(user.id, HOST)

      const tokens = await PasswordResetToken.where('userId', user.id).get()

      expect(tokens).toHaveLength(1)
    })
  })
})
