import { CompetitorData } from '@/app/(protected)/(tournaments)/models/CompetitorData'

/** Minimal user info embedded in a competitor for display purposes. */
export interface CompetitorUserInfo {
  id: number
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  email: string
  displayName: string
}

/** Serializable representation of a Competitor — safe to pass server→client. */
export interface CompetitorDto {
  id: number
  tournamentCategoryId: number
  /** Player user ids in roster order (index 0 is the main player / team captain). */
  playerIds: number[]
  /** Already resolved from `label` when the competitor has one (interclubes teams). */
  displayName: string
  shortName: string
  /** Team name of an interclubes competitor (venue name, disambiguated with a letter). Null otherwise. */
  label: string | null
  /** Type-specific attributes (interclubes: the venue the team represents). */
  data: CompetitorData | null
  seedNumber: number | null
  createdAt: string
  /** Embedded player user info in roster order (populated when `players` is loaded). */
  players?: CompetitorUserInfo[]
}
