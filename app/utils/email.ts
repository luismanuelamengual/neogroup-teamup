import { Resend } from 'resend'

// Lazily constructed: the Resend SDK throws immediately (at construction time) when
// given an empty/missing API key, so building it eagerly at module load would crash
// every environment without RESEND_API_KEY set (local dev without Resend, e2e tests,
// ...) as soon as this module is imported — before sendEmail's own guard ever runs.
let resend: Resend | null = null

function getResendClient(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }

  return resend
}

/**
 * Strips the "+" tag from an email address before sending.
 * e.g. luisamengual+player1@gmail.com => luisamengual@gmail.com
 */
function normalizeRecipient(email: string): string {
  const atIndex = email.lastIndexOf('@')

  if (atIndex === -1) {
    return email
  }

  const local = email.slice(0, atIndex)
  const domain = email.slice(atIndex)
  const plusIndex = local.indexOf('+')

  return plusIndex === -1 ? email : local.slice(0, plusIndex) + domain
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL ?? 'TeamUp <noreply@teamup.ar>'

  // Without an API key (local dev without Resend configured, e2e tests, ...) there is no
  // way to actually deliver the email. Skip the call instead of letting it throw — the
  // caller (registerUser / forgotPassword) already persisted the token that matters, and
  // the email is just the delivery mechanism for it.
  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(`[email] RESEND_API_KEY not set — skipping email "${subject}" to ${to}`)

    return
  }

  await getResendClient().emails.send({
    from,
    to: normalizeRecipient(to),
    subject,
    html
  })
}
