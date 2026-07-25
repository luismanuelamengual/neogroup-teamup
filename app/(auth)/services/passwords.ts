import { randomBytes } from 'crypto'
import { PasswordResetToken } from '@/app/(auth)/models/PasswordResetToken'
import { User } from '@/app/models/User'
import { resolveAppUrl } from '@/app/utils/domains'
import { sendEmail } from '@/app/utils/email'

/** Lifetime of a token requested by the user from the "forgot password" screen. */
const RESET_TOKEN_EXPIRY_HOURS = 1
/**
 * Lifetime of the token of an invitation / administrator-triggered reset. Longer
 * than a self-service reset because the user is not necessarily in front of the
 * screen when the mail is sent.
 */
const INVITATION_TOKEN_EXPIRY_HOURS = 24

export interface PasswordResetEmailOptions {
  /** `Host` header of the current request — used to build the organization's absolute URL. */
  host: string
  /**
   * True when this is the first mail the user gets (account created by an
   * administrator): the copy invites them to set their password instead of
   * announcing a reset they never asked for.
   */
  invitation?: boolean
}

/**
 * Issues a fresh password reset token for `user` (invalidating any previous one)
 * and emails them the link to set a new password.
 *
 * Shared by the public "forgot password" flow and by the administrator's user
 * management screen (account creation and manual password reset), so the token
 * lifecycle lives in exactly one place.
 */
export async function sendPasswordResetEmail(
  user: User,
  { host, invitation = false }: PasswordResetEmailOptions
): Promise<void> {
  // Only one reset link can be valid at a time.
  const existing = await PasswordResetToken.where('userId', user.id).get()

  for (const previousToken of existing) {
    await previousToken.delete()
  }

  const expiryHours = invitation ? INVITATION_TOKEN_EXPIRY_HOURS : RESET_TOKEN_EXPIRY_HOURS
  const token = randomBytes(32).toString('hex')
  const resetToken = new PasswordResetToken()

  resetToken.userId = user.id
  resetToken.token = token
  resetToken.expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)
  await resetToken.save()

  const resetUrl = `${resolveAppUrl(host)}/reset-password?token=${token}`
  const firstName = user.firstName ?? 'usuario'
  const subject = invitation ? 'Tu cuenta de TeamUp' : 'Restablecer contraseña de TeamUp'
  const intro = invitation
    ? 'Se creó una cuenta para vos en TeamUp. Para empezar a usarla, definí tu contraseña:'
    : 'Recibimos una solicitud para restablecer la contraseña de tu cuenta de TeamUp.'
  const action = invitation ? 'Definir mi contraseña' : 'Restablecer contraseña'
  const footer = invitation
    ? 'Si creés que recibiste este mensaje por error, podés ignorarlo.'
    : 'Si no solicitaste este cambio, podés ignorar este mensaje.'

  await sendEmail({
    to: user.email,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hola ${firstName},</h2>
        <p>${intro}</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1976d2;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
          ${action}
        </a>
        <p style="margin-top:24px;color:#666;font-size:13px;">
          El enlace es válido por ${expiryHours} ${expiryHours === 1 ? 'hora' : 'horas'}.<br>
          ${footer}
        </p>
      </div>
    `
  })
}
