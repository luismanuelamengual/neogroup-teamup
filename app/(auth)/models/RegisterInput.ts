import type { Role } from '@/app/(auth)/models/Role'

/** Payload to create a new user with email/password credentials. */
export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  phoneNumber?: string
  roleId: Role
}
