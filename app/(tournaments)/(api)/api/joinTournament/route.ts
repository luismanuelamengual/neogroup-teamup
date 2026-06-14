import { Repository } from '@neogroup/neorm'
import { User } from '@/app/(auth)/models/User'
import { getUserDisplayName } from '@/app/(auth)/utils/user'
import { JoinTournamentInput } from '@/app/(tournaments)/actions/registration'
import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(tournaments)/utils/discipline'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/joinTournament — registers the signed-in user (optionally with a partner) into a tournament. */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }
  const tournament: Tournament | null = await Repository.get(Tournament)
    .where('id', Number(tournamentId))
    .with('competitors')
    .first()

  if (!tournament) {
    throw new ApiException('notFound')
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('registrationClosed')
  }

  const competitors = tournament.competitors ?? []

  if (competitors.length >= tournament.maxCompetitors) {
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

  const user = await Repository.get(User).find(userId)

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
  let partnerName: string | null = null
  let partnerDisplayName = ''

  if (needsPartner) {
    if (input.partnerUserId) {
      const partner = await Repository.get(User).find(input.partnerUserId)

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
  await Repository.get(Competitor).save(competitor)
})
