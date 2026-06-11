import { NextRequest, NextResponse } from 'next/server'
import { leaveTournament } from '@/app/_services/registration.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'

/** DELETE /api/registrations/[tournamentId] — removes the signed-in user registration. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tournamentId: string }> }
): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { tournamentId } = await context.params

  return serviceResponse(await leaveTournament(userId, Number(tournamentId)))
}
