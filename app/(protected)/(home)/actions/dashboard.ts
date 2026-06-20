import { OrganizationStatsDto } from '@/app/(protected)/(home)/models/OrganizerDashboardDto'
import { PlayerDashboardDto } from '@/app/(protected)/(home)/models/PlayerDashboardDto'
import { executeRequest } from '@/app/actions/api'

/** Stats + active tournaments for the player home dashboard. */
export async function getPlayerDashboard(): Promise<PlayerDashboardDto> {
  return executeRequest<PlayerDashboardDto>('/getPlayerDashboard')
}

/** Organization-wide stats for the organizer home dashboard. */
export async function getOrganizationStats(): Promise<OrganizationStatsDto> {
  return executeRequest<OrganizationStatsDto>('/getOrganizationStats')
}
