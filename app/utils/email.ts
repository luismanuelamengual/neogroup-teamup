import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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

  await resend.emails.send({
    from,
    to: normalizeRecipient(to),
    subject,
    html
  })
}
