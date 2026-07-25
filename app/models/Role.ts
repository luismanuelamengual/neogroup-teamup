/**
 * Role assigned to a user once (at registration, at first login or by an
 * administrator). Cannot be switched by the user.
 *
 * Ids start at 1 on purpose: a `0` would be falsy, so every `if (user.roleId)`
 * in the codebase would silently treat that role as "no role assigned".
 * With this numbering, any assigned role is truthy and only `null` means
 * "no role yet" (see migration 007-shift-role-ids).
 */
export enum Role {
  ADMINISTRATOR = 1,
  ORGANIZER = 2,
  PLAYER = 3
}

export const RoleNames: Record<Role, string> = {
  [Role.ADMINISTRATOR]: 'Administrador',
  [Role.ORGANIZER]: 'Organizador',
  [Role.PLAYER]: 'Jugador'
}

/** Roles an administrator can assign to the users of its organization. */
export const ManageableRoles: Role[] = [Role.ORGANIZER, Role.PLAYER]
