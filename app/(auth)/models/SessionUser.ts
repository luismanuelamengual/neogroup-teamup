import { UserDto } from '@/app/models/UserDto'

/** Serializable subset of UserDto — safe to pass server→client and store in the user store. */
export type SessionUser = Pick<
  UserDto,
  'id' | 'email' | 'firstName' | 'lastName' | 'nickname' | 'roleId' | 'displayName' | 'avatarUrl'
>
