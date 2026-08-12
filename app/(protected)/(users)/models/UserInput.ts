import { Role } from '@/app/models/Role'

/** Payload used by the administrator to create a user of its organization. */
export interface CreateUserInput {
  email: string
  firstName: string
  lastName: string
  phoneNumber?: string | null
  siteId?: number | null
  roleId: Role
}

/**
 * Payload used by the administrator to edit an existing user. The email can be
 * changed, as long as it stays unique within the organization.
 */
export interface UpdateUserInput {
  email: string
  firstName: string
  lastName: string
  phoneNumber?: string | null
  siteId?: number | null
  roleId: Role
  active: boolean
}
