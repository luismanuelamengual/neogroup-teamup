import { Discipline, ScoreFormat, TournamentSettings, TournamentType } from '@/app/_models/types'

/**
 * Types shared by the API route handlers (server) and the actions (client):
 * request payloads and the common result shape.
 */

/** Shared result type returned by the API endpoints. */
export interface ApiResult {
  success: boolean
  error?: string
  id?: number
}

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
}

export interface AccountInput {
  firstName: string
  lastName: string
  nickname: string
}

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
