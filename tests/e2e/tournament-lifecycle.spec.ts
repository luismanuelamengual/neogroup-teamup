import { expect, test } from '@playwright/test'
import { buildTestUser, loginViaUi, Role, signUpAndLogIn } from './helpers/auth'
import { fillMuiDateField, nearFutureDateDigits, selectMuiOption } from './helpers/tournament'

/**
 * Covers the two main "organizer" and "player" flows together, end to end, the
 * way they actually happen in the app: an organizer creates a free, singles
 * tennis league (no partner registration, so the join flow stays simple), two
 * players find it and join, the organizer starts it once there are enough
 * competitors, a player reports their own match result, and the organizer
 * finishes the tournament.
 *
 * Each actor (organizer, player 1, player 2) gets its own isolated browser
 * context — a separate login session — like they would on separate devices.
 */
test('organizer creates a tournament, two players join and play it, organizer finishes it', async ({ browser }) => {
  const tournamentName = `E2E League ${Date.now()}`
  const organizer = buildTestUser(Role.ORGANIZER, 'organizer-lifecycle')
  const player1 = buildTestUser(Role.PLAYER, 'player1-lifecycle')
  const player2 = buildTestUser(Role.PLAYER, 'player2-lifecycle')
  const organizerContext = await browser.newContext()
  const organizerPage = await organizerContext.newPage()

  await test.step('organizer registers and logs in', async () => {
    await signUpAndLogIn(organizerPage, organizer)
  })

  let tournamentUrl = ''

  await test.step('organizer creates a free singles tennis league', async () => {
    await organizerPage.goto('/tournaments')
    await organizerPage.getByRole('link', { name: 'Crear torneo' }).click()
    await expect(organizerPage).toHaveURL(/\/tournaments\/new/)

    await organizerPage.getByLabel('Nombre').fill(tournamentName)

    // Tennis singles: doesn't register competitors as pairs, keeping the join
    // flow (and this test) simple. League is already the default "Tipo".
    await selectMuiOption(organizerPage, 'Disciplina', 'Tenis')

    await fillMuiDateField(organizerPage, 'Fecha de inicio', nearFutureDateDigits())

    await organizerPage.getByLabel(/Máx\. competidores/).fill('2')

    await organizerPage.getByRole('button', { name: 'Crear torneo' }).click()
    await expect(organizerPage).toHaveURL(/\/tournaments\/\d+$/)
    tournamentUrl = organizerPage.url()

    await expect(organizerPage.getByRole('heading', { name: tournamentName })).toBeVisible()
    await expect(organizerPage.getByText('Inscripción abierta')).toBeVisible()
    // Not enough competitors yet.
    await expect(organizerPage.getByRole('button', { name: 'Iniciar torneo' })).toBeDisabled()
  })

  await test.step('two players find the tournament and join it', async () => {
    for (const player of [player1, player2]) {
      const context = await browser.newContext()
      const page = await context.newPage()

      await signUpAndLogIn(page, player)

      await page.goto('/tournaments')
      await page.getByPlaceholder('Buscar por nombre').fill(tournamentName)
      await page.getByText(tournamentName).click()
      await expect(page).toHaveURL(tournamentUrl)

      await page.getByRole('button', { name: 'Inscribirme' }).click()
      await page.getByRole('button', { name: 'Confirmar inscripción' }).click()

      // exact: 'Inscripto' is otherwise a substring of the always-present
      // "Competidores inscriptos" section heading.
      await expect(page.getByText('Inscripto', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Darme de baja' })).toBeVisible()

      await context.close()
    }
  })

  await test.step('organizer starts the tournament once both players are in', async () => {
    await organizerPage.reload()
    await expect(organizerPage.getByText('2 / 2')).toBeVisible()

    await organizerPage.getByRole('button', { name: 'Iniciar torneo' }).click()
    await organizerPage.getByRole('dialog').getByRole('button', { name: 'Iniciar' }).click()

    // Scoped to the header's status chip: the open round's own "En juego" chip
    // (FixtureView) renders the exact same text lower on the page once started.
    await expect(organizerPage.locator('.title-actions').getByText('En juego')).toBeVisible()
    await expect(organizerPage.locator('.match-card')).toBeVisible()
  })

  await test.step('a player reports the match result as a walkover', async () => {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Already registered and verified in the previous step — just log back in.
    await loginViaUi(page, player1.email, player1.password)
    await page.goto(tournamentUrl)

    await page.getByRole('button', { name: 'Cargar resultado' }).click()
    await page.getByRole('dialog').getByLabel('W.O. (no se presentó)').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Editar resultado')).toBeVisible()

    await context.close()
  })

  await test.step('organizer finishes the tournament', async () => {
    await organizerPage.reload()
    await expect(organizerPage.getByRole('button', { name: 'Finalizar torneo' })).toBeEnabled()

    await organizerPage.getByRole('button', { name: 'Finalizar torneo' }).click()
    await organizerPage.getByRole('dialog').getByRole('button', { name: 'Finalizar' }).click()

    await expect(organizerPage.locator('.title-actions').getByText('Finalizado')).toBeVisible()
  })

  await organizerContext.close()
})
