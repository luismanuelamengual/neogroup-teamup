import { RankingSettings } from '@/app/(protected)/(rankings)/models/RankingSettings'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentCategoryDto } from '@/app/(protected)/(tournaments)/models/TournamentCategoryDto'
import { TournamentImageDto } from '@/app/(protected)/(tournaments)/models/TournamentImageDto'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/** Serializable representation of a Tournament — safe to pass server→client. */
export interface TournamentDto {
  id: number
  ownerId: number
  name: string
  description: string | null
  image?: TournamentImageDto | null
  status: TournamentStatus
  discipline: Discipline
  subDiscipline: SubDiscipline | null
  type: TournamentType
  scoreFormat: ScoreFormat
  startDate: string
  startTime: string | null
  /** Optional "YYYY-MM-DD" date from which the tournament accepts registrations. Null: open since creation. */
  startInscriptionsDate: string | null
  siteId: number | null
  /** Resolved venue (eager-loaded with the tournament). */
  site?: SiteDto | null
  /**
   * Whether TeamUp's service fee for this tournament was already settled by the
   * organization. Whether the tournament has a cost for players is `entryFee > 0`.
   */
  paid: boolean
  /** Entry fee players settle directly with the organizer. Null/0 means free. */
  entryFee: number | null
  /** When true, a player taking part in a match may submit its result themselves. Otherwise only the organizer can. */
  allowPlayerSetScore: boolean
  categories?: TournamentCategoryDto[]
  settings: TournamentSettings | null
  rankingSettings?: RankingSettings | null
  createdAt: string
  updatedAt: string
  competitors?: CompetitorDto[]
  matches?: MatchDto[]
}
