import { expect, Page } from '@playwright/test'

/**
 * Types a date into one of MUI X's section-based DatePicker fields.
 *
 * The field itself is a `role="group"` container (accessible name = the
 * DatePicker's `label`) wrapping one keyboard-navigable "section" per date
 * part (year/month/day, ordered per the `format` prop) plus a visually
 * hidden `<input>` that mirrors the combined value — `getByLabel` matches
 * both, so the group is what disambiguates. `.fill()` doesn't work reliably
 * against these fields.
 *
 * Clicking the group can land the caret on any section depending on where
 * inside it the click happens to fall, so ArrowLeft is pressed a few extra
 * times first to clamp it back to the first (leftmost/year) section — it's a
 * no-op once already there, so over-pressing is harmless and, unlike a
 * modifier shortcut (e.g. Ctrl/Cmd+A "select all sections"), doesn't depend on
 * the field recognizing a particular key combo. Typing digits in section
 * order (here "YYYYMMDD", matching the app's `format="YYYY/MM/DD"`) then
 * fills the whole date — MUI auto-advances to the next section once one is
 * complete.
 */
export async function fillMuiDateField(page: Page, label: string, digitsInSectionOrder: string): Promise<void> {
  const field = page.getByRole('group', { name: label })

  await field.click()

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowLeft')
  }

  await page.keyboard.type(digitsInSectionOrder)

  // Fail here, with a clear cause, if the sections didn't actually pick up the
  // input — instead of surfacing much later as a confusing "form didn't
  // submit" failure once "required" blocks the submit button.
  await expect(field.locator('input')).not.toHaveValue('', { timeout: 2000 })
}

/**
 * Opens a MUI `<TextField select>` (Select) and picks an option by its visible text.
 *
 * On a just-navigated, freshly-compiled page (Next.js dev/Turbopack can take a
 * beat to finish hydrating a route hit for the first time), the very first
 * click on an interactive component can land before its React click handler is
 * attached — the click is a no-op, the dropdown never opens, and the specific
 * option `getByRole('option', ...)` waits on then never appears. Wrapped in
 * `expect(...).toPass()` so a swallowed first click just gets retried a moment
 * later, once hydration has caught up, instead of the whole test hanging on
 * the option's wait until the test timeout.
 */
export async function selectMuiOption(page: Page, comboboxName: string, optionName: string): Promise<void> {
  const combobox = page.getByRole('combobox', { name: comboboxName })
  const option = page.getByRole('option', { name: optionName })

  await expect(async () => {
    // In case a previous attempt did open the menu, close it first so every
    // attempt starts from the same (closed) state.
    await page.keyboard.press('Escape')
    await combobox.click()
    await option.waitFor({ state: 'visible', timeout: 1500 })
  }).toPass({ timeout: 15_000, intervals: [500] })

  await option.click()
}

/** A YYYYMMDD string a few days from now, safely in the future regardless of when the suite runs. */
export function nearFutureDateDigits(daysFromNow = 7): string {
  const date = new Date()

  date.setDate(date.getDate() + daysFromNow)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}${month}${day}`
}
