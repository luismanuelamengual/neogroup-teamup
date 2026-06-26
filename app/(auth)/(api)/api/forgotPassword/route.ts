import { randomBytes } from 'crypto'
import { PasswordResetToken } from '@/app/(auth)/models/PasswordResetToken'
import { User } from '@/app/(auth)/models/User'
import { ApiException } from '@/app/models/ApiException'
import { withApi } from '@/app/utils/api-server'
import { sendEmail } from '@/app/utils/email'

const TOKEN_EXPIRY_HOURS = 1

/** POST /api/forgotPassword — sends a password reset email if the account exists. */
export const POST = withApi(async (request, _context, organizationId) => {
  const { email: rawEmail } = (await request.json()) as { email: string }
  const email = rawEmail?.trim().toLowerCase()

  if (!email) {
    throw new ApiException('missingFields')
  }

  const user = await User.withoutGlobalScopes().where('organizationId', organizationId).where('email', email).first()

  // Always return success to avoid user enumeration
  if (!user || !user.emailVerified) {
    return null
  }

  // Delete any existing reset tokens for this user
  const existing = await PasswordResetToken.where('userId', user.id).get()

  for (const t of existing) {
    await t.delete()
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
  const resetToken = new PasswordResetToken()

  resetToken.userId = user.id
  resetToken.token = token
  resetToken.expiresAt = expiresAt
  await resetToken.save()

  const host = request.headers.get('host') ?? ''
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const resetUrl = `${protocol}://${host}/reset-password?token=${token}`
  const firstName = user.firstName ?? 'usuario'

  await sendEmail({
    to: email,
    subject: 'Restablecer contraseña de TeamUp',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hola ${firstName},</h2>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de TeamUp.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1976d2;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
          Restablecer contraseña
        </a>
        <p style="margin-top:24px;color:#666;font-size:13px;">
          El enlace es válido por ${TOKEN_EXPIRY_HOURS} hora.<br>
          Si no solicitaste este cambio, podés ignorar este mensaje.
        </p>
      </div>
    `
  })

  return null
})
