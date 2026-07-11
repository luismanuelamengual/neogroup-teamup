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

  test('an organizer sees Mercado Pago as unavailable when the platform has no credentials configured', async ({
    page
  }) => {
    // The e2e server never sets MP_CLIENT_ID / MP_CLIENT_SECRET (see tests/e2e/env.ts),
    // so payments stay "not configured" — this exercises that (very real, since a
    // fresh deployment starts this way) state without ever hitting the real
    // Mercado Pago OAuth flow.
    const organizer = buildTestUser(Role.ORGANIZER, 'account-mp')

    await signUpAndLogIn(page, organizer)
    await page.goto('/account')

    await expect(page.getByText('Cobros (Mercado Pago)')).toBeVisible()
    await expect(page.getByText('Los pagos no están habilitados en esta plataforma todavía.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Conectar Mercado Pago' })).toHaveCount(0)
  })

  test('the Mercado Pago connect endpoint safely redirects back when unconfigured', async ({ page }) => {
    const organizer = buildTestUser(Role.ORGANIZER, 'account-mp-connect')

    await signUpAndLogIn(page, organizer)
    await page.goto('/api/mercadopago/connect')

    await expect(page).toHaveURL(/\/account\?mp=unavailable/)
    await expect(page.getByText('Los pagos no están disponibles en esta plataforma')).toBeVisible()
  })
})
