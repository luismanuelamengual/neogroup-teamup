import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

/** Stats about the tournaments owned by the signed-in organizer. */
export interface OrganizerStatsDto {
  tournamentsTotal: number
  tournamentsActive: number
  tournamentsFinished: number
  competitorsTotal: number
  /** Average competitors per tournament, rounded to one decimal. */
  avgCompetitors: number
  matchesPlayed: number
  matchesPending: number
}

/** Stats about the whole organization. */
export interface OrganizationStatsDto {
  tournamentsTotal: number
  tournamentsActive: number
  tournamentsFinished: number
  competitorsTotal: number
  avgCompetitors: number
  /** Distinct platform users that participated in any tournament. */
  distinctPlayers: number
  matchesTotal: number
  matchesPlayed: number
  matchesPending: number
}

/** Payload for the organizer home dashboard. */
export interface OrganizerDashboardDto {
  personal: OrganizerStatsDto
  organization: OrganizationStatsDto
  /** The organizer's own non-finished tournaments (full detail). */
  activeTournaments: TournamentDto[]
}
