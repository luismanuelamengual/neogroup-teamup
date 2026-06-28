import { RankingSettings } from '@/app/(protected)/(rankings)/models/RankingSettings'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundDto } from '@/app/(protected)/(tournaments)/models/RoundDto'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentCategoryDto } from '@/app/(protected)/(tournaments)/models/TournamentCategoryDto'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/** Serializable representation of a Tournament — safe to pass server→client. */
export interface TournamentDto {
  id: number
  ownerId: number
  name: string
  description: string | null
  status: TournamentStatus
  discipline: Discipline
  subDiscipline: SubDiscipline | null
  type: TournamentType
  scoreFormat: ScoreFormat
  startDate: string
  startTime: string | null
  location: string | null
  /** When true, players must pay `entryFee` to register; otherwise the tournament is free. */
  paid: boolean
  /** Entry fee amount (in `currency`) required to register. Null/0 when the tournament is free. */
  entryFee: number | null
  /** ISO currency code of the entry fee (e.g. "ARS"). */
  currency: string
  /**
   * Concrete category instances of this tournament (always at least one). When
   * the tournament has no organizer-defined categories there is a single one
   * with categoryId = null (the "single category").
   */
  categories?: TournamentCategoryDto[]
  settings: TournamentSettings | null
  /** Ranking points configuration (how many points each finishing placement grants). */
  rankingSettings?: RankingSettings | null
  createdAt: string
  updatedAt: string
  competitors?: CompetitorDto[]
  rounds?: RoundDto[]
  matches?: MatchDto[]
}
