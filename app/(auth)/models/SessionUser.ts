import type { User } from '@/app/(auth)/models/User'

/** Serializable subset of User — safe to pass server→client and store in the user store. */
export type SessionUser = Pick<
  User,
  'id' | 'email' | 'firstName' | 'lastName' | 'nickname' | 'roleId' | 'displayName' | 'avatarUrl'
>
