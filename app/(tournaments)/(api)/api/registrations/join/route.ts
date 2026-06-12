import { User } from '@/app/(auth)/entities/User'
import { getUserDisplayName } from '@/app/(auth)/models/user'
import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import { JoinTournamentInput } from '@/app/(tournaments)/models/inputs'
import { registersAsPairs } from '@/app/(tournaments)/models/types'
import { ApiException, withAuth } from '@/app/utils/api-server'

/** POST /api/registrations/join — registers the signed-in user (optionally with a partner) into a tournament. */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }
  const tournament: Tournament | null = await Tournament.find(Number(tournamentId))

  if (!tournament) {
    throw new ApiException('notFound')
  }

  if (tournament.status !== 'stand_by') {
    throw new ApiException('registrationClosed')
  }

  const competitors = await Competitor.where('tournamentId', tournament.id).get()

  if (competitors.length >= tournament.maxCompetitors) {
    throw new ApiException('tournamentFull')
  }

  const alreadyRegistered = competitors.some(
    (competitor: any) =>
      competitor.userId === userId ||
      competitor.partnerUserId === userId ||
      (input.partnerUserId &&
        (competitor.userId === input.partnerUserId || competitor.partnerUserId === input.partnerUserId))
  )

  if (alreadyRegistered) {
    throw new ApiException('alreadyRegistered')
  }

  const user = await User.find(userId)

  if (!user) {
    throw new ApiException('unauthorized')
  }

  const needsPartner = registersAsPairs(tournament.discipline, tournament.type, tournament.settings ?? {})
  let partnerUserId: number | null = null
  let partnerName: string | null = null
  let partnerDisplayName = ''

  if (needsPartner) {
    if (input.partnerUserId) {
      const partner = await User.find(input.partnerUserId)

      if (!partner) {
        throw new ApiException('partnerNotFound')
      }

      partnerUserId = partner.id
      partnerDisplayName = getUserDisplayName(partner)
    } else if (input.partnerName?.trim()) {
      partnerName = input.partnerName.trim()
      partnerDisplayName = partnerName
    } else {
      throw new ApiException('partnerRequired')
    }
  }

  const competitor = new Competitor()

  competitor.tournamentId = tournament.id
  competitor.userId = userId
  competitor.partnerUserId = partnerUserId
  competitor.partnerName = partnerName
  competitor.displayName = needsPartner
    ? `${getUserDisplayName(user)} / ${partnerDisplayName}`
    : getUserDisplayName(user)
  competitor.createdAt = new Date()
  await competitor.save()
})
