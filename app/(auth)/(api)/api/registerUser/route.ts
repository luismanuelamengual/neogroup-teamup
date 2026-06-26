import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { EmailVerificationToken } from '@/app/(auth)/models/EmailVerificationToken'
import { Organization } from '@/app/(auth)/models/Organization'
import { RegisterInput } from '@/app/(auth)/models/RegisterInput'
import { Role } from '@/app/(auth)/models/Role'
import { User } from '@/app/(auth)/models/User'
import { isValidRole } from '@/app/(auth)/utils/user'
import { ApiException } from '@/app/models/ApiException'
import { withApi } from '@/app/utils/api-server'
import { sendEmail } from '@/app/utils/email'

const TOKEN_EXPIRY_HOURS = 24

/** POST /api/registerUser — creates a new user with email/password credentials (public). */
export const POST = withApi(async (request, context, organizationId) => {
  const input = (await request.json()) as RegisterInput
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiException('invalidEmail')
  }

  if (password.length < 6) {
    throw new ApiException('passwordTooShort')
  }

  if (!firstName || !lastName) {
    throw new ApiException('missingFields')
  }

  if (!isValidRole(input.roleId)) {
    throw new ApiException('invalidRole')
  }

  // If the organization does not allow organizer self-registration, force the player role.
  const organization = await Organization.where('id', organizationId).first()
  const roleId = organization?.allowOrganizersCreation ? input.roleId : Role.PLAYER
  const existing = await User.withoutGlobalScopes()
    .where('organizationId', organizationId)
    .where('email', email)
    .first()

  if (existing) {
    throw new ApiException('emailAlreadyRegistered')
  }

  const user = new User()

  user.organizationId = organizationId
  user.email = email
  user.passwordHash = await bcrypt.hash(password, 10)
  user.firstName = firstName
  user.lastName = lastName
  user.nickname = null
  user.phoneNumber = input.phoneNumber?.trim() || null
  user.roleId = roleId
  user.emailVerified = false
  await user.save()

  // Generate a verification token and send the email
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
  const verificationToken = new EmailVerificationToken()

  verificationToken.userId = user.id
  verificationToken.token = token
  verificationToken.expiresAt = expiresAt
  await verificationToken.save()

  const host = request.headers.get('host') ?? ''
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const verificationUrl = `${protocol}://${host}/api/verifyEmail?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Verificá tu cuenta de TeamUp',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hola ${firstName},</h2>
        <p>Gracias por registrarte en TeamUp. Para activar tu cuenta, hacé clic en el siguiente botón:</p>
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 24px;background:#1976d2;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
          Verificar mi email
        </a>
        <p style="margin-top:24px;color:#666;font-size:13px;">
          El enlace es válido por ${TOKEN_EXPIRY_HOURS} horas.<br>
          Si no creaste esta cuenta, podés ignorar este mensaje.
        </p>
      </div>
    `
  })

  return { id: user.id }
})
