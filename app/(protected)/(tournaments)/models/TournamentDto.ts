import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundDto } from '@/app/(protected)/(tournaments)/models/RoundDto'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
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
  /** Ids of the categories this tournament runs. */
  categoryIds: number[] | null
  /** Resolved categories (id + name) for categoryIds — populated on detail/list responses. */
  categories?: CategoryDto[]
  maxCompetitors: number
  settings: TournamentSettings | null
  createdAt: string
  updatedAt: string
  competitors?: CompetitorDto[]
  rounds?: RoundDto[]
  matches?: MatchDto[]
}
