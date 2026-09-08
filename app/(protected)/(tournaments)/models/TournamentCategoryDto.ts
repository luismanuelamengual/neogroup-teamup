import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import type { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

/** Serializable representation of a TournamentCategory — safe to pass server→client. */
export interface TournamentCategoryDto {
  id: number
  tournamentId: number
  /** Catalogue category id (null for the single category). */
  categoryId: number | null
  maxCompetitors: number
  /** Resolved catalogue category (null for the single category). */
  category?: CategoryDto | null
  /**
   * The tournament this instance belongs to. Only loaded where a category
   * instance is reached from BELOW (from a match) rather than from the
   * tournament itself — the head-to-head history, which mixes matches from
   * many tournaments and has to name each one.
   */
  tournament?: TournamentDto
}
