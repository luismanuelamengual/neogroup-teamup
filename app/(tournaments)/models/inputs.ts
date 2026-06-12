import { Discipline, ScoreFormat, TournamentSettings, TournamentType } from '@/app/(tournaments)/models/types'

/** Request payloads shared by the tournaments API route handlers (BE) and the actions (FE). */

export interface JoinTournamentInput {
  partnerUserId?: number | null
  partnerName?: string | null
}

export interface CreateTournamentInput {
  name: string
  description: string
  discipline: Discipline
  type: TournamentType
  scoreFormat: ScoreFormat
  startDate: string
  location: string
  maxCompetitors: number
  settings: TournamentSettings
}

export interface UpdateTournamentInput {
  name: string
  description: string
  location: string
  startDate: string
  maxCompetitors: number
}
