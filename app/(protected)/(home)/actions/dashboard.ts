import { OrganizationStatsDto } from '@/app/(protected)/(home)/models/OrganizerDashboardDto'
import { PlayerStatsDto } from '@/app/(protected)/(home)/models/PlayerDashboardDto'
import { executeRequest } from '@/app/actions/api'

/** Aggregated stats for the player home dashboard. */
export async function getPlayerStats(): Promise<PlayerStatsDto> {
  return executeRequest<PlayerStatsDto>('/getPlayerStats')
}

/** Organization-wide stats for the organizer home dashboard. */
export async function getOrganizationStats(): Promise<OrganizationStatsDto> {
  return executeRequest<OrganizationStatsDto>('/getOrganizationStats')
}
