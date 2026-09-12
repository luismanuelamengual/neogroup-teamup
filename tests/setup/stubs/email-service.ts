/* eslint-disable */
/**
 * Test stub for app/utils/email.ts.
 *
 * The real module skips delivery when RESEND_API_KEY is unset — which it always
 * is in tests — but it announces the skip on the console first, once per mail.
 * The suite creates users and triggers password resets by the dozen, so that is
 * dozens of warnings buried in the output for something every test already
 * takes for granted.
 *
 * What a test can still observe about an email is the row that makes it
 * actionable: `sendPasswordResetEmail` persists a PasswordResetToken before
 * calling this, and tests assert on that instead of on the delivery. Both the
 * sandbox loader and vitest.config.ts alias the email module to this file.
 */
export async function sendEmail(): Promise<void> {}

export default { sendEmail }
