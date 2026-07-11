import { expect, test } from '@playwright/test'
import { buildTestUser, loginViaUi, registerViaUi, Role, signUpAndLogIn, verifyEmailViaToken } from './helpers/auth'
import { getLatestPasswordResetToken } from './helpers/db'

test.describe('Auth', () => {
  test('a player can register, verify their email and log in', async ({ page }) => {
    const user = buildTestUser(Role.PLAYER, 'player')

    await signUpAndLogIn(page, user)

    // The account menu shows the active profile — confirms the chosen role stuck.
    await page.getByRole('button', { name: user.firstName }).click()
    await expect(page.getByText('Jugador', { exact: true })).toBeVisible()
  })

  test('an organizer can register, verify their email and log in', async ({ page }) => {
    const user = buildTestUser(Role.ORGANIZER, 'organizer')

    await signUpAndLogIn(page, user)

    await page.getByRole('button', { name: user.firstName }).click()
    await expect(page.getByText('Organizador', { exact: true })).toBeVisible()
  })

  test('logging in before verifying the email fails', async ({ page }) => {
    const user = buildTestUser(Role.PLAYER, 'unverified')

    await registerViaUi(page, user)
    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Contraseña').fill(user.password)
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible()
  })

  test('a wrong password shows an error and does not sign in', async ({ page }) => {
    const user = buildTestUser(Role.PLAYER, 'wrongpass')

    await registerViaUi(page, user)
    await verifyEmailViaToken(page, user.email)

    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Contraseña').fill('not-the-password')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('a logged in user can log out', async ({ page }) => {
    const user = buildTestUser(Role.PLAYER, 'logout')

    await signUpAndLogIn(page, user)

    await page.getByRole('button', { name: user.firstName }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()

    await expect(page).toHaveURL(/\/login/)

    // The session is really gone: visiting a protected page bounces back to /login.
    await page.goto('/home')
    await expect(page).toHaveURL(/\/login/)
  })

  test('a user can reset a forgotten password and log in with the new one', async ({ page }) => {
    const user = buildTestUser(Role.PLAYER, 'forgot')

    await registerViaUi(page, user)
    await verifyEmailViaToken(page, user.email)

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(page.getByText(new RegExp(`${user.email}.*recibirás un correo`))).toBeVisible()

    await expect
      .poll(() => getLatestPasswordResetToken(user.email), {
        message: 'waiting for password reset token in the database'
      })
      .not.toBeNull()

    const token = getLatestPasswordResetToken(user.email)
    const newPassword = 'NewTest1234!'

    await page.goto(`/reset-password?token=${token}`)
    await page.getByLabel('Nueva contraseña').fill(newPassword)
    await page.getByLabel('Confirmar contraseña').fill(newPassword)
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()

    await expect(page).toHaveURL(/\/login\?passwordReset=1/)

    await loginViaUi(page, user.email, newPassword)
  })
})
