import { Role } from '@/app/models/Role'

/** Payload used by the administrator to create a user of its organization. */
export interface CreateUserInput {
  email: string
  firstName: string
  lastName: string
  nickname?: string | null
  phoneNumber?: string | null
  roleId: Role
}

/**
 * Payload used by the administrator to edit an existing user. The email is not
 * editable: it identifies the account (and its Gravatar) and is the target of
 * every notification already sent.
 */
export interface UpdateUserInput {
  firstName: string
  lastName: string
  nickname?: string | null
  phoneNumber?: string | null
  roleId: Role
  active: boolean
}
