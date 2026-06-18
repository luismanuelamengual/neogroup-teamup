import { User } from '@/app/(auth)/models/User'
import { getUserDisplayName } from '@/app/(auth)/utils/user'
import { JoinTournamentInput } from '@/app/(protected)/(tournaments)/actions/tournament'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/joinTournament — registers the signed-in user (optionally with a partner) into a tournament. */
export const POST = withAuth(async (request, context, userId, _organizationId) => {
  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }
  const tournament = await Tournament.where('id', Number(tournamentId)).with('competitors').first()

  if (!tournament) {
    throw new ApiException('notFound')
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('registrationClosed')
  }

  const competitors = tournament.competitors ?? []
  const hasCategories = tournament.categories && tournament.categories.length > 0
  // Category is mandatory when the tournament defines categories.
  let category: string | null = null

  if (hasCategories) {
    const requested = input.category?.trim()

    if (!requested) {
      throw new ApiException('categoryRequired')
    }

    category = tournament.categories!.find((name) => name === requested) ?? null

    if (!category) {
      throw new ApiException('invalidCategory')
    }

    // When categories exist, the limit applies per category.
    const categoryCount = competitors.filter((c) => c.category === category).length

    if (categoryCount >= tournament.maxCompetitors) {
      throw new ApiException('tournamentFull')
    }
  } else {
    // No categories: the limit applies to the whole tournament.
    if (competitors.length >= tournament.maxCompetitors) {
      throw new ApiException('tournamentFull')
    }
  }

  const alreadyRegistered = competitors.some(
    (competitor) =>
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

  const needsPartner = registersAsPairs(
    tournament.discipline,
    tournament.subDiscipline,
    tournament.type,
    tournament.settings ?? {}
  )
  let partnerUserId: number | null = null
  let partnerDisplayName = ''

  if (needsPartner) {
    if (!input.partnerUserId) {
      throw new ApiException('partnerRequired')
    }

    const partner = await User.find(input.partnerUserId)

    if (!partner) {
      throw new ApiException('partnerNotFound')
    }

    partnerUserId = partner.id
    partnerDisplayName = getUserDisplayName(partner)
  }

  const competitor = new Competitor()

  competitor.tournamentId = tournament.id
  competitor.userId = userId
  competitor.partnerUserId = partnerUserId
  competitor.partnerName = null
  competitor.displayName = needsPartner
    ? `${getUserDisplayName(user)} / ${partnerDisplayName}`
    : getUserDisplayName(user)
  competitor.category = category
  competitor.createdAt = new Date()
  await competitor.save()
})
