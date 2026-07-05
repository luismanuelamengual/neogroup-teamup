/** Role assigned to a user once (at registration or first login). Cannot be switched. */
export enum Role {
  ORGANIZER = 1,
  PLAYER = 2
}

export const RoleNames: Record<Role, string> = {
  [Role.ORGANIZER]: 'Organizador',
  [Role.PLAYER]: 'Jugador'
}
