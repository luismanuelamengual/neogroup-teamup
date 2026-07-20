import { RankingSettings } from '@/app/(protected)/(rankings)/models/RankingSettings'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundDto } from '@/app/(protected)/(tournaments)/models/RoundDto'
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
  location: string | null
  paid: boolean
  entryFee: number | null
  currency: string
  categories?: TournamentCategoryDto[]
  settings: TournamentSettings | null
  rankingSettings?: RankingSettings | null
  createdAt: string
  updatedAt: string
  competitors?: CompetitorDto[]
  rounds?: RoundDto[]
  matches?: MatchDto[]
}
