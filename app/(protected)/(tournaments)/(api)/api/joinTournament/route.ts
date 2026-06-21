import { User } from '@/app/(auth)/models/User'
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
  const tournament = await Tournament.where('id', Number(tournamentId)).with('categories', 'competitors').first()

  if (!tournament) {
    throw new ApiException('notFound')
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('registrationClosed')
  }

  const competitors = tournament.competitors ?? []
  const categories = tournament.categories ?? []
  const realCategories = categories.filter((category) => category.categoryId != null)
  // Resolve the category instance this entry registers into. When the
  // tournament defines categories the player must pick one; otherwise it is the
  // single category (categoryId = null).
  let targetCategory

  if (realCategories.length > 0) {
    const requested = input.tournamentCategoryId != null ? Number(input.tournamentCategoryId) : null

    if (!requested) {
      throw new ApiException('categoryRequired')
    }

    targetCategory = realCategories.find((category) => category.id === requested)

    if (!targetCategory) {
      throw new ApiException('invalidCategory')
    }
  } else {
    targetCategory = categories[0]

    if (!targetCategory) {
      throw new ApiException('invalidCategory')
    }
  }

  // The entry limit always applies per category instance.
  const categoryCount = competitors.filter((c) => c.tournamentCategoryId === targetCategory.id).length

  if (categoryCount >= targetCategory.maxCompetitors) {
    throw new ApiException('tournamentFull')
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

  if (needsPartner) {
    if (!input.partnerUserId) {
      throw new ApiException('partnerRequired')
    }

    const partner = await User.find(input.partnerUserId)

    if (!partner) {
      throw new ApiException('partnerNotFound')
    }

    partnerUserId = partner.id
  }

  const competitor = new Competitor()

  competitor.tournamentCategoryId = targetCategory.id
  competitor.userId = userId
  competitor.partnerUserId = partnerUserId
  competitor.createdAt = new Date()
  await competitor.save()
})
