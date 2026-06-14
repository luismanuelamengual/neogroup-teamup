import { getTournaments } from '@/app/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/search — searches joinable/visible tournaments by name. */
export const POST = withAuth(async (request) => {
  const { name } = (await request.json()) as { name?: string }

  return getTournaments({ name, withCompetitors: true })
})
