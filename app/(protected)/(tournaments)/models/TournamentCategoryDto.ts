import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'

/** Serializable representation of a TournamentCategory — safe to pass server→client. */
export interface TournamentCategoryDto {
  id: number
  tournamentId: number
  /** Catalogue category id (null for the single category). */
  categoryId: number | null
  maxCompetitors: number
  /** Resolved catalogue category (null for the single category). */
  category?: CategoryDto | null
}
