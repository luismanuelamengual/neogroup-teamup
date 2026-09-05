import { StaleTournamentDto } from '@/app/(protected)/(tournaments)/models/StaleTournamentDto'
import { getStaleTournaments } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withOrganizerOrAdmin } from '@/app/utils/api-server'

/**
 * POST /api/getStaleTournaments — ONGOING tournaments of the organization stuck
 * without match activity for a while, for the organizer home reminder banner.
 *
 * Organization-wide for both profiles, like /getPendingPayments: the
 * administrator can see the same reminder even though only the organizer
 * dashboard currently renders it.
 */
export const POST = withOrganizerOrAdmin(async (): Promise<StaleTournamentDto[]> => getStaleTournaments())
