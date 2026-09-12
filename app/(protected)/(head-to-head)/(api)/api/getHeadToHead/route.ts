import { getHeadToHeadMatches } from '@/app/(protected)/(head-to-head)/services/headToHead'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

interface GetHeadToHeadBody {
  /** Player user ids of one side (one for singles, the whole roster for a pair/team). */
  homePlayerIds?: unknown
  /** Player user ids of the other side. */
  awayPlayerIds?: unknown
}

/** Player ids as they arrive from the client: an array of positive integers, nothing else. */
function parsePlayerIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiException('missingFields')
  }

  return value.map((id) => {
    const parsed = Number(id)

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiException('missingFields')
    }

    return parsed
  })
}

/**
 * POST /api/getHeadToHead — every match two sides have played against each
 * other, across every tournament of the organization, most recent first. Open
 * to any signed-in user: it only lists results that are already visible on the
 * tournaments they belong to.
 */
export const POST = withAuth(async (request) => {
  const body = (await request.json()) as GetHeadToHeadBody

  return getHeadToHeadMatches(parsePlayerIds(body.homePlayerIds), parsePlayerIds(body.awayPlayerIds))
})
