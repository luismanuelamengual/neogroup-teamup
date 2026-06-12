/** Available roles. A user gets a role once (at registration or first login) and cannot switch it. */
export const UserRoles = {
  ORGANIZER: 1,
  PLAYER: 2
} as const

export type UserRoleId = (typeof UserRoles)[keyof typeof UserRoles]
