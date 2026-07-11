import { expect, Page } from '@playwright/test'
import { getLatestEmailVerificationToken } from './db'

export const Role = {
  ORGANIZER: 1,
  PLAYER: 2
} as const

export type RoleId = (typeof Role)[keyof typeof Role]

const RoleLabel: Record<RoleId, string> = {
  [Role.ORGANIZER]: 'Organizador',
  [Role.PLAYER]: 'Jugador'
}

export interface TestUser {
  email: string
  password: string
  firstName: string
  lastName: string
  roleId: RoleId
}

/** Builds a unique, throwaway test user. Emails must be unique per run since the
 * e2e database is only reset once for the whole suite (see global-setup.ts). */
export function buildTestUser(roleId: RoleId, label: string): TestUser {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    email: `${label}-${unique}@e2e.teamup.test`,
    password: 'Test1234!',
    firstName: label === 'organizer' ? 'Organizadora' : 'Jugadora',
    lastName: `E2E ${unique}`,
    roleId
  }
}

/** Fills and submits the registration form. Leaves the page on the "check your email" screen. */
export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Nombre').fill(user.firstName)
  await page.getByLabel('Apellido').fill(user.lastName)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: RoleLabel[user.roleId] }).click()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Verificá tu email')).toBeVisible()
}

/**
 * Reads the verification token straight out of the database (no real email is
 * ever sent in this environment — see app/utils/email.ts) and visits the
 * verification link, the same way clicking the emailed button would.
 */
export async function verifyEmailViaToken(page: Page, email: string): Promise<void> {
  await expect
    .poll(() => getLatestEmailVerificationToken(email), { message: 'waiting for verification token in the database' })
    .not.toBeNull()

  const token = getLatestEmailVerificationToken(email)

  await page.goto(`/api/verifyEmail?token=${token}`)
  await expect(page).toHaveURL(/\/login\?verified=1/)
}

/** Logs in through the UI form and waits for the post-login redirect to complete. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/home$/)
}

/** Full pipeline: register, verify (via DB token) and log in. Leaves the page on /home. */
export async function signUpAndLogIn(page: Page, user: TestUser): Promise<void> {
  await registerViaUi(page, user)
  await verifyEmailViaToken(page, user.email)
  await loginViaUi(page, user.email, user.password)
}
