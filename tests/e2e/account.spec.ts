import { expect, test } from '@playwright/test'
import { buildTestUser, Role, signUpAndLogIn } from './helpers/auth'

test.describe('Account', () => {
  test('a user can edit and save their account details', async ({ page }) => {
    const user = buildTestUser(Role.PLAYER, 'account')

    await signUpAndLogIn(page, user)
    await page.goto('/account')

    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()

    const newLastName = `Updated ${Date.now()}`

    await page.getByLabel('Apellido').fill(newLastName)
    await page.getByLabel('Apodo').fill('ElCrack')
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Datos guardados correctamente')).toBeVisible()

    // The save also re-signs the session cookie (see updateAccount/route.ts's
    // unstable_update call), so a hard reload reflects the new values straight
    // from the JWT — proving the change round-tripped through the database.
    await page.reload()

    await expect(page.getByLabel('Apellido')).toHaveValue(newLastName)
    await expect(page.getByLabel('Apodo')).toHaveValue('ElCrack')
  })

  test('the account page no longer offers a payment platform to connect', async ({ page }) => {
    // Organizers do not collect through TeamUp any more: players settle the
    // entry fee with them off-platform, so there is nothing to connect here.
    const organizer = buildTestUser(Role.ORGANIZER, 'account-no-mp')

    await signUpAndLogIn(page, organizer)
    await page.goto('/account')

    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
    await expect(page.getByText('Cobros (Mercado Pago)')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Conectar Mercado Pago' })).toHaveCount(0)
  })

  test('an organizer reaches the payments page from the user menu', async ({ page }) => {
    const organizer = buildTestUser(Role.ORGANIZER, 'account-payments')

    await signUpAndLogIn(page, organizer)
    await page.goto('/home')
    await page.getByRole('button', { name: new RegExp(organizer.firstName, 'i') }).click()
    await page.getByRole('menuitem', { name: 'Pagos' }).click()

    await expect(page).toHaveURL(/\/payments/)
    await expect(page.getByRole('heading', { name: 'Pagos' })).toBeVisible()
    // A brand-new organizer owes nothing.
    await expect(page.getByText('No tenés pagos pendientes')).toBeVisible()
  })

  test('a player cannot reach the payments page', async ({ page }) => {
    const player = buildTestUser(Role.PLAYER, 'account-payments-player')

    await signUpAndLogIn(page, player)
    await page.goto('/payments')

    await expect(page).toHaveURL(/\/home/)
  })
})
