import { JoinTournamentInput } from '@/app/_models/api'
import { Competitor } from '@/app/_models/Competitor'
import { getUserDisplayName } from '@/app/_models/dtos'
import { Tournament } from '@/app/_models/Tournament'
import { registersAsPairs } from '@/app/_models/types'
import { User } from '@/app/_models/User'
import { apiResponse, withAuth } from '@/app/_utils/api-server'

/** POST /api/registrations — registers the signed-in user (optionally with a partner) into a tournament. */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }
  const tournament: Tournament | null = await Tournament.find(Number(tournamentId))

  if (!tournament) {
    return apiResponse({ success: false, error: 'notFound' })
  }

  if (tournament.status !== 'stand_by') {
    return apiResponse({ success: false, error: 'registrationClosed' })
  }

  const competitors = await Competitor.where('tournamentId', tournament.id).get()

  if (competitors.length >= tournament.maxCompetitors) {
    return apiResponse({ success: false, error: 'tournamentFull' })
  }

  const alreadyRegistered = competitors.some(
    (competitor: any) =>
      competitor.userId === userId ||
      competitor.partnerUserId === userId ||
      (input.partnerUserId &&
        (competitor.userId === input.partnerUserId || competitor.partnerUserId === input.partnerUserId))
  )

  if (alreadyRegistered) {
    return apiResponse({ success: false, error: 'alreadyRegistered' })
  }

  const user = await User.find(userId)

  if (!user) {
    return apiResponse({ success: false, error: 'unauthorized' })
  }

  const needsPartner = registersAsPairs(tournament.discipline, tournament.type, tournament.settings ?? {})
  let partnerUserId: number | null = null
  let partnerName: string | null = null
  let partnerDisplayName = ''

  if (needsPartner) {
    if (input.partnerUserId) {
      const partner = await User.find(input.partnerUserId)

      if (!partner) {
        return apiResponse({ success: false, error: 'partnerNotFound' })
      }

      partnerUserId = partner.id
      partnerDisplayName = getUserDisplayName(partner)
    } else if (input.partnerName?.trim()) {
      partnerName = input.partnerName.trim()
      partnerDisplayName = partnerName
    } else {
      return apiResponse({ success: false, error: 'partnerRequired' })
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

  return apiResponse({ success: true })
})
