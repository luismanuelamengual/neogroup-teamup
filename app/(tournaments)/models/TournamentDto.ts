import { Discipline } from '@/app/(tournaments)/models/Discipline'
import { ScoreFormat } from '@/app/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(tournaments)/models/SubDiscipline'
import { TournamentSettings } from '@/app/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'

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
  categories: string[] | null
  maxCompetitors: number
  settings: TournamentSettings | null
  currentRound: number
  createdAt: string
  updatedAt: string
  competitorsCount: number
}
