/**
 * Bulk-inscribes existing users into a tournament for a given category.
 * Fills up to maxCompetitors slots (or N if --slots is passed).
 *
 * Handles both singles and doubles disciplines:
 *   - Padel and Tennis Doubles → registers pairs (player + partner).
 *   - Tennis Singles           → registers individual players.
 *   - Americano with swapPartnersEachRound → registers individually even if doubles.
 *
 * Usage:
 *   npx tsx scripts/bulkJoinTournament.ts <tournamentId> <category> [--slots <n>]
 *
 * Examples:
 *   npx tsx scripts/bulkJoinTournament.ts 1 "Categoría A"
 *   npx tsx scripts/bulkJoinTournament.ts 1 "Categoría A" --slots 8
 *
 * Notes:
 *   - Only users with roleId = PLAYER are considered.
 *   - Users already registered in the tournament are skipped.
 *   - The tournament must be in STAND_BY status for inscriptions to be accepted.
 */
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

import { Role } from '@/app/(auth)/models/Role'
import { User } from '@/app/(auth)/models/User'
import { getUserDisplayName } from '@/app/(auth)/utils/user'
import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(tournaments)/utils/discipline'

function parseArgs(): { tournamentId: number; category: string; slots: number | null } {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/bulkJoinTournament.ts <tournamentId> <category> [--slots <n>]')
    console.error('Example: npx tsx scripts/bulkJoinTournament.ts 1 "Categoría A" --slots 8')
    process.exit(1)
  }

  const tournamentId = parseInt(args[0], 10)

  if (isNaN(tournamentId)) {
    console.error(`Invalid tournamentId: "${args[0]}"`)
    process.exit(1)
  }

  const category = args[1]
  let slots: number | null = null
  const slotsIndex = args.indexOf('--slots')

  if (slotsIndex !== -1) {
    slots = parseInt(args[slotsIndex + 1] ?? '', 10)

    if (isNaN(slots) || slots <= 0) {
      console.error('--slots must be a positive integer')
      process.exit(1)
    }
  }

  return { tournamentId, category, slots }
}

async function run(): Promise<void> {
  const { tournamentId, category, slots } = parseArgs()
  // Load tournament with its current competitors.
  const tournament = await Tournament.where('id', tournamentId).with('competitors').first()

  if (!tournament) {
    console.error(`Tournament #${tournamentId} not found.`)
    process.exit(1)
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    console.error(
      `Tournament "${tournament.name}" is not in STAND_BY status (current status: ${tournament.status}). Inscriptions are closed.`
    )
    process.exit(1)
  }

  const hasCategories = tournament.categories && tournament.categories.length > 0

  if (hasCategories) {
    const validCategory = tournament.categories!.find((c) => c === category)

    if (!validCategory) {
      console.error(`Category "${category}" not found in tournament.`)
      console.error(`Available categories: ${tournament.categories!.map((c) => `"${c}"`).join(', ')}`)
      process.exit(1)
    }
  }

  const isPairs = registersAsPairs(
    tournament.discipline,
    tournament.subDiscipline,
    tournament.type,
    tournament.settings ?? {}
  )

  const competitors = tournament.competitors ?? []
  // Count how many slots are already taken for this category.
  const takenInCategory = hasCategories ? competitors.filter((c) => c.category === category).length : competitors.length
  const maxSlots = slots ?? tournament.maxCompetitors
  const availableSlots = Math.min(maxSlots, tournament.maxCompetitors) - takenInCategory

  if (availableSlots <= 0) {
    console.log(`No available slots for category "${category}" in tournament "${tournament.name}".`)
    process.exit(0)
  }

  console.log(`Tournament: "${tournament.name}" (#${tournament.id})`)
  console.log(`Category:   "${category}"`)
  console.log(`Mode:       ${isPairs ? 'pairs (doubles)' : 'singles'}`)
  console.log(`Slots to fill: ${availableSlots} (${takenInCategory}/${tournament.maxCompetitors} already taken)`)
  console.log()

  // IDs of users already registered (any category).
  const registeredUserIds = new Set(
    competitors.flatMap((c) => [c.userId, c.partnerUserId]).filter((id): id is number => id !== null)
  )
  // Load players not yet registered.
  const allPlayers = await User.where('roleId', Role.PLAYER).get()
  const eligiblePlayers = allPlayers.filter((u) => !registeredUserIds.has(u.id))

  if (eligiblePlayers.length === 0) {
    console.error('No eligible players found. Create more users with scripts/createDummyUsers.ts')
    process.exit(1)
  }

  let enrolled = 0

  if (isPairs) {
    // Need 2 players per competitor slot — consume eligiblePlayers in pairs.
    const needed = availableSlots * 2
    if (eligiblePlayers.length < 2) {
      console.error('Need at least 2 eligible players for a doubles tournament.')
      process.exit(1)
    }

    const pairs = Math.min(availableSlots, Math.floor(eligiblePlayers.length / 2))

    for (let i = 0; i < pairs; i++) {
      const player = eligiblePlayers[i * 2]
      const partner = eligiblePlayers[i * 2 + 1]
      const competitor = new Competitor()

      competitor.tournamentId = tournament.id
      competitor.userId = player.id
      competitor.partnerUserId = partner.id
      competitor.partnerName = null
      competitor.displayName = `${getUserDisplayName(player)} / ${getUserDisplayName(partner)}`
      competitor.category = hasCategories ? category : null
      competitor.createdAt = new Date()

      try {
        await competitor.save()
        console.log(
          `  [${enrolled + 1}/${pairs}] Enrolled pair: ${competitor.displayName}`
        )
        enrolled++
      } catch (err: any) {
        console.warn(`  Skipped pair (${getUserDisplayName(player)} / ${getUserDisplayName(partner)}): ${err?.message ?? err}`)
      }
    }

    if (eligiblePlayers.length < needed) {
      console.warn(
        `Warning: only ${Math.floor(eligiblePlayers.length / 2)} pair(s) possible; ${availableSlots - enrolled} slot(s) remain unfilled.`
      )
    }
  } else {
    // Singles — one player per competitor slot.
    const toEnroll = eligiblePlayers.slice(0, availableSlots)

    for (const user of toEnroll) {
      const competitor = new Competitor()

      competitor.tournamentId = tournament.id
      competitor.userId = user.id
      competitor.partnerUserId = null
      competitor.partnerName = null
      competitor.displayName = getUserDisplayName(user)
      competitor.category = hasCategories ? category : null
      competitor.createdAt = new Date()

      try {
        await competitor.save()
        console.log(
          `  [${enrolled + 1}/${toEnroll.length}] Enrolled: ${competitor.displayName} <${user.email}>`
        )
        enrolled++
      } catch (err: any) {
        console.warn(`  Skipped user #${user.id} (${err?.message ?? err})`)
      }
    }

    if (toEnroll.length < availableSlots) {
      console.warn(
        `Warning: only ${toEnroll.length} eligible player(s) available; ${availableSlots - toEnroll.length} slot(s) remain unfilled.`
      )
    }
  }

  console.log(
    `\nDone. ${enrolled} competitor(s) enrolled into "${tournament.name}" – category "${category}".`
  )
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
  })
