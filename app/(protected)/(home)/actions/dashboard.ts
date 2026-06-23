import { OrganizationStatisticsDto } from '@/app/(protected)/(home)/models/OrganizationStatisticsDto'
import { PlayerStatisticsDto } from '@/app/(protected)/(home)/models/PlayerStatisticsDto'
import { executeRequest } from '@/app/actions/api'

/** Aggregated stats for the player home dashboard. */
export async function getPlayerStats(): Promise<PlayerStatisticsDto> {
  return executeRequest<PlayerStatisticsDto>('/getPlayerStats')
}

/** Organization-wide stats for the organizer home dashboard. */
export async function getOrganizationStats(): Promise<OrganizationStatisticsDto> {
  return executeRequest<OrganizationStatisticsDto>('/getOrganizationStats')
}
