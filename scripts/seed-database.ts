/* eslint-disable no-console */
/**
 * Database seeder.
 *
 * Connects to the database configured through the environment variables (same
 * resolution used by scripts/migrate-database.ts) and builds a full demo/test data set:
 *
 *   - One organizer account (id = 1, email "demo-organizer@gmail.com", password "123qwe").
 *   - 32 player accounts (email "demo{id}@gmail.com", password "123qwe") with realistic names.
 *   - A broad catalogue of tournaments exercising every feature of the app:
 *       · every discipline / sub-discipline (padel, tennis singles, tennis doubles)
 *       · every type (league, americano, playoff)
 *       · every status (stand_by, ongoing, finished)
 *       · several development phases (just started, mid-round, advanced)
 *       · every score format (3 sets, 2 sets + super tie-break, basic count)
 *       · different scoring settings (custom league/americano points, partner swap)
 *       · tournaments with and without categories
 *
 * Tournaments that are ongoing or finished are driven through the real tournament
 * engine (rounds and match results are generated the same way the app does), so
 * the resulting data is always coherent.
 *
 * Run `yarn run db:reset` first to start from a clean schema.
 *
 * Usage: yarn run db:seed
 */
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

import { execSync } from 'child_process'

execSync('yarn run db:reset', { stdio: 'inherit' })

import { DB } from '@neogroup/neorm'
import bcrypt from 'bcryptjs'
import { Role } from '@/app/(auth)/models/Role'
import { User } from '@/app/(auth)/models/User'
import { getUserDisplayName } from '@/app/(auth)/utils/user'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SetScore } from '@/app/(protected)/(tournaments)/models/SetScore'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { createRound, progressTournamentAfterResult } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import { getScoreWinner } from '@/app/(protected)/(tournaments)/utils/score'

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))

    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }

  return copy
}

// ---------------------------------------------------------------------------
// Demo data pools (realistic Spanish / Latin-American names and venues)
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Alejandro',
  'María',
  'Juan',
  'Laura',
  'Carlos',
  'Ana',
  'Luis',
  'Sofía',
  'Diego',
  'Valentina',
  'Martín',
  'Camila',
  'Andrés',
  'Isabella',
  'Felipe',
  'Daniela',
  'Santiago',
  'Gabriela',
  'Sebastián',
  'Lucía',
  'Mateo',
  'Paula',
  'Nicolás',
  'Andrea',
  'Ricardo',
  'Fernanda',
  'Roberto',
  'Natalia',
  'Javier',
  'Patricia',
  'Miguel',
  'Verónica',
  'Ignacio',
  'Claudia',
  'Rodrigo',
  'Beatriz',
  'Tomás',
  'Florencia',
  'Joaquín',
  'Agustina'
]
const LAST_NAMES = [
  'García',
  'Martínez',
  'López',
  'González',
  'Pérez',
  'Rodríguez',
  'Sánchez',
  'Ramírez',
  'Torres',
  'Flores',
  'Rivera',
  'Gómez',
  'Díaz',
  'Cruz',
  'Morales',
  'Reyes',
  'Herrera',
  'Medina',
  'Ruiz',
  'Vargas',
  'Romero',
  'Jiménez',
  'Alvarado',
  'Moreno',
  'Muñoz',
  'Vega',
  'Castillo',
  'Ramos',
  'Ortiz',
  'Silva',
  'Mendoza',
  'Guerrero',
  'Delgado',
  'Navarro',
  'Aguilar',
  'Acosta',
  'Soto',
  'Contreras'
]
const VENUES = [
  'Club Náutico Hacoaj',
  'Polideportivo Municipal',
  'Club de Campo San Isidro',
  'Racket Club Belgrano',
  'Pádel Center Palermo',
  'Club Atlético Vélez',
  'Estación Pádel Pilar',
  'Tenis Club Argentino',
  'Complejo Deportivo Norte',
  'Club Ciudad de Buenos Aires',
  'GEBA',
  'Club Hindú',
  'Arena Pádel Nordelta'
]
const PASSWORD = '123qwe'

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface SeededUsers {
  organizer: User
  players: User[]
}

async function createUsers(playerCount: number): Promise<SeededUsers> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  // Organizer first so it gets id = 1 on a freshly migrated database.
  const organizer = new User()

  organizer.email = 'demo-organizer@gmail.com'
  organizer.passwordHash = passwordHash
  organizer.firstName = 'Demo'
  organizer.lastName = 'Organizer'
  organizer.nickname = null
  organizer.roleId = Role.ORGANIZER
  await organizer.save()

  if (organizer.id !== 1) {
    console.warn(`Warning: organizer id is ${organizer.id}, expected 1. Run "yarn run db:reset" before seeding.`)
  }

  const players: User[] = []

  for (let i = 0; i < playerCount; i++) {
    const player = new User()

    player.firstName = randomItem(FIRST_NAMES)
    player.lastName = randomItem(LAST_NAMES)
    player.nickname = null
    player.passwordHash = passwordHash
    player.roleId = Role.PLAYER
    // Temporary placeholder — replaced with "demo{id}" once we know the id.
    player.email = `seed_placeholder_${Date.now()}_${i}`
    await player.save()

    player.email = `demo${player.id}@gmail.com`
    await DB.table('users').where('id', player.id).update({ email: player.email })

    players.push(player)
  }

  console.log(`Created organizer (id=${organizer.id}) and ${players.length} players.`)

  return { organizer, players }
}

// ---------------------------------------------------------------------------
// Score generation (always produces a valid, winner-determinable score)
// ---------------------------------------------------------------------------

function randomSide(): MatchSide {
  return Math.random() < 0.5 ? MatchSide.HOME : MatchSide.AWAY
}

/** A decisive set (6-x) from the perspective of whoever should win it. */
function decisiveSet(homeWins: boolean): SetScore {
  const winner = 6
  const loser = randomInt(0, 4)

  return homeWins ? { home: winner, away: loser } : { home: loser, away: winner }
}

/** A super tie-break set (10-x). */
function superTieBreakSet(homeWins: boolean): SetScore {
  const winner = 10
  const loser = randomInt(0, 8)

  return homeWins ? { home: winner, away: loser } : { home: loser, away: winner }
}

function buildSets(format: ScoreFormat, homeWins: boolean): SetScore[] {
  const isSuperTieBreak = format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK

  // ~60% straight-sets win, ~40% three-set win.
  if (Math.random() < 0.6) {
    return [decisiveSet(homeWins), decisiveSet(homeWins)]
  }

  return [
    decisiveSet(homeWins),
    decisiveSet(!homeWins),
    isSuperTieBreak ? superTieBreakSet(homeWins) : decisiveSet(homeWins)
  ]
}

function basicCountScore(homeWins: boolean): MatchScore {
  const winner = randomInt(4, 9)
  const loser = randomInt(0, winner - 1)

  return homeWins ? { home: winner, away: loser } : { home: loser, away: winner }
}

/** Generates a valid score for the given format (occasionally a walkover). */
function generateScore(format: ScoreFormat, allowWalkover: boolean): MatchScore {
  if (allowWalkover && Math.random() < 0.07) {
    return { walkover: randomSide() }
  }

  const homeWins = Math.random() < 0.5

  if (format === ScoreFormat.BASIC_COUNT) {
    return basicCountScore(homeWins)
  }

  return { sets: buildSets(format, homeWins) }
}

// ---------------------------------------------------------------------------
// Competitor registration
// ---------------------------------------------------------------------------

async function registerCompetitors(
  tournament: Tournament,
  pool: User[],
  competitorCount: number,
  categories: string[] | null
): Promise<void> {
  const isPairs = registersAsPairs(
    tournament.discipline,
    tournament.subDiscipline,
    tournament.type,
    tournament.settings ?? {}
  )
  const players = shuffle(pool)
  let cursor = 0

  for (let i = 0; i < competitorCount; i++) {
    const competitor = new Competitor()

    competitor.tournamentId = tournament.id
    competitor.partnerName = null

    if (isPairs) {
      const player = players[cursor++]
      const partner = players[cursor++]

      competitor.userId = player.id
      competitor.partnerUserId = partner.id
      competitor.displayName = `${getUserDisplayName(player)} / ${getUserDisplayName(partner)}`
    } else {
      const player = players[cursor++]

      competitor.userId = player.id
      competitor.partnerUserId = null
      competitor.displayName = getUserDisplayName(player)
    }

    // Round-robin assignment keeps every category evenly filled.
    competitor.category = categories ? categories[i % categories.length] : null
    competitor.createdAt = new Date()
    await competitor.save()
  }
}

// ---------------------------------------------------------------------------
// Tournament engine simulation
// ---------------------------------------------------------------------------

/** Applies a generated result to a single match and drives the tournament forward. */
async function playMatch(tournament: Tournament, round: Round, match: Match): Promise<void> {
  const score = generateScore(tournament.scoreFormat, true)

  if (score.walkover) {
    match.score = { walkover: score.walkover }
    match.status = MatchStatus.WALKOVER
    match.winner = score.walkover
  } else {
    match.score = score
    match.status = MatchStatus.PLAYED
    match.winner = getScoreWinner(score, tournament.scoreFormat)
  }

  match.updatedAt = new Date()
  await match.save()

  await progressTournamentAfterResult(tournament, round)
}

/**
 * Plays the matches of the tournament's current round number. `fraction` < 1
 * leaves the rest pending (used to model a tournament caught mid-round).
 */
async function playCurrentRound(tournament: Tournament, fraction: number): Promise<void> {
  const rounds = await Round.where('tournamentId', tournament.id)
    .where('number', tournament.currentRound)
    .where('status', RoundStatus.OPEN)
    .get()

  for (const round of rounds) {
    const pending = (await Match.where('roundId', round.id).where('status', MatchStatus.PENDING).get()).filter(
      (match) => match.homeCompetitorIds.length > 0 && (match.awayCompetitorIds?.length ?? 0) > 0
    )
    const count = fraction >= 1 ? pending.length : Math.ceil(pending.length * fraction)

    for (let i = 0; i < count; i++) {
      await playMatch(tournament, round, pending[i])
    }
  }
}

/** Completes up to `maxRounds` full rounds (or until the tournament finishes). */
async function playFullRounds(tournament: Tournament, maxRounds: number): Promise<void> {
  let completed = 0
  let guard = 0

  while (tournament.status === TournamentStatus.ONGOING && completed < maxRounds && guard++ < 60) {
    const before = tournament.currentRound

    await playCurrentRound(tournament, 1)
    completed++

    // Safety: bail out if the round could not be completed/advanced.
    if (tournament.status === TournamentStatus.ONGOING && tournament.currentRound === before) {
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Tournament specifications
// ---------------------------------------------------------------------------

type OngoingPhase = 'just_started' | 'partial' | 'mid'

interface TournamentSpec {
  name: string
  description: string
  discipline: Discipline
  subDiscipline: SubDiscipline | null
  type: TournamentType
  scoreFormat: ScoreFormat
  categories: string[] | null
  competitorCount: number
  /** Defaults to competitorCount; set higher to leave open inscription slots. */
  maxCompetitors?: number
  settings: TournamentSettings
  status: TournamentStatus
  /** Only for ONGOING tournaments. */
  phase?: OngoingPhase
  /** Full rounds to complete for the 'mid' phase (default 2). */
  completedRounds?: number
}

const BASE_DATE = new Date('2026-06-16')

function dateOffset(days: number): string {
  const date = new Date(BASE_DATE)

  date.setDate(date.getDate() + days)

  return date.toISOString().slice(0, 10)
}

/** Start date heuristic by status: finished in the past, ongoing recent, stand_by upcoming. */
function startDateFor(status: TournamentStatus): string {
  if (status === TournamentStatus.FINISHED) {
    return dateOffset(-randomInt(20, 60))
  }

  if (status === TournamentStatus.ONGOING) {
    return dateOffset(-randomInt(2, 10))
  }

  return dateOffset(randomInt(3, 30))
}

const SPECS: TournamentSpec[] = [
  // ---- Padel · League ----
  {
    name: 'Liga Apertura de Pádel 2026',
    description: 'Liga regular de parejas, todos contra todos.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 6,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.FINISHED
  },
  {
    name: 'Liga Metropolitana de Pádel',
    description: 'Liga con categorías A y B en paralelo.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.TWO_SETS_SUPER_TIEBREAK,
    categories: ['Categoría A', 'Categoría B'],
    competitorCount: 8,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.ONGOING,
    phase: 'mid',
    completedRounds: 2
  },
  {
    name: 'Liga Nocturna de Pádel',
    description: 'Inscripciones abiertas, conteo simple de games.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 4,
    maxCompetitors: 8,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.STAND_BY
  },
  {
    name: 'Liga Premium de Pádel',
    description: 'Puntaje personalizado: presente, set y partido.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 6,
    settings: { pointsPerPresent: 1, pointsPerSetWon: 2, pointsPerMatchWon: 3 },
    status: TournamentStatus.ONGOING,
    phase: 'partial'
  },

  // ---- Padel · Americano ----
  {
    name: 'Americano de Pádel Verano',
    description: 'Americano clásico de parejas fijas.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.AMERICANO,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 6,
    settings: { ...DEFAULT_AMERICANO_SETTINGS },
    status: TournamentStatus.FINISHED
  },
  {
    name: 'Americano Rotativo de Pádel',
    description: 'Cada jugador cambia de compañero por ronda.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.AMERICANO,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 8,
    settings: { ...DEFAULT_AMERICANO_SETTINGS, swapPartnersEachRound: true },
    status: TournamentStatus.ONGOING,
    phase: 'just_started'
  },
  {
    name: 'Americano Social de Pádel',
    description: 'Rotación de compañeros, en curso.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.AMERICANO,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 6,
    settings: { pointsPerGameWon: 1, pointsPerMatchWon: 2, swapPartnersEachRound: true },
    status: TournamentStatus.ONGOING,
    phase: 'mid',
    completedRounds: 2
  },
  {
    name: 'Americano de Pádel Empresas',
    description: 'Parejas fijas, puntos por partido ganado.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.AMERICANO,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 6,
    maxCompetitors: 10,
    settings: { pointsPerGameWon: 1, pointsPerMatchWon: 3, swapPartnersEachRound: false },
    status: TournamentStatus.STAND_BY
  },

  // ---- Padel · Playoff ----
  {
    name: 'Copa Eliminación de Pádel',
    description: 'Llave de eliminación directa de parejas.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 8,
    settings: {},
    status: TournamentStatus.FINISHED
  },
  {
    name: 'Copa Master de Pádel',
    description: 'Playoff en curso, fase de semifinales.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.TWO_SETS_SUPER_TIEBREAK,
    categories: null,
    competitorCount: 8,
    settings: {},
    status: TournamentStatus.ONGOING,
    phase: 'mid',
    completedRounds: 1
  },
  {
    name: 'Copa Desafío de Pádel',
    description: 'Llave por categorías, inscripción abierta.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: ['Damas', 'Caballeros'],
    competitorCount: 8,
    maxCompetitors: 16,
    settings: {},
    status: TournamentStatus.STAND_BY
  },
  {
    name: 'Gran Premio de Pádel',
    description: 'Playoff por categorías ya finalizado.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: ['Categoría A', 'Categoría B'],
    competitorCount: 8,
    settings: {},
    status: TournamentStatus.FINISHED
  },

  // ---- Tennis · Singles ----
  {
    name: 'Liga de Tenis Singles',
    description: 'Liga individual a tres sets.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 6,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.FINISHED
  },
  {
    name: 'Liga de Tenis por Categorías',
    description: 'Singles con dos categorías en paralelo.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.TWO_SETS_SUPER_TIEBREAK,
    categories: ['Primera', 'Segunda'],
    competitorCount: 8,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.ONGOING,
    phase: 'mid',
    completedRounds: 2
  },
  {
    name: 'Liga Relámpago de Tenis',
    description: 'Cantidad impar de jugadores (con descansos).',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 5,
    maxCompetitors: 8,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.STAND_BY
  },
  {
    name: 'Abierto de Tenis Singles',
    description: 'Cuadro de eliminación directa finalizado.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 8,
    settings: {},
    status: TournamentStatus.FINISHED
  },
  {
    name: 'Challenger de Tenis',
    description: 'Llave de 6 jugadores con byes, en juego.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.TWO_SETS_SUPER_TIEBREAK,
    categories: null,
    competitorCount: 6,
    settings: {},
    status: TournamentStatus.ONGOING,
    phase: 'mid',
    completedRounds: 1
  },
  {
    name: 'Torneo Apertura de Tenis',
    description: 'Singles eliminación directa, inscripción abierta.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 8,
    maxCompetitors: 16,
    settings: {},
    status: TournamentStatus.STAND_BY
  },

  // ---- Tennis · Doubles ----
  {
    name: 'Liga de Tenis Dobles',
    description: 'Liga de parejas a tres sets, finalizada.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.DOUBLES,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 6,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.FINISHED
  },
  {
    name: 'Liga Mixta de Dobles',
    description: 'Tres categorías chicas en paralelo, en curso.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.DOUBLES,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.TWO_SETS_SUPER_TIEBREAK,
    categories: ['Mixto A', 'Mixto B', 'Mixto C'],
    competitorCount: 6,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.ONGOING,
    phase: 'just_started'
  },
  {
    name: 'Copa de Dobles Recién Iniciada',
    description: 'Playoff de parejas que acaba de comenzar.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.DOUBLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 8,
    settings: {},
    status: TournamentStatus.ONGOING,
    phase: 'just_started'
  },
  {
    name: 'Copa de Dobles Aniversario',
    description: 'Llave de parejas, inscripción abierta.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.DOUBLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 8,
    maxCompetitors: 16,
    settings: {},
    status: TournamentStatus.STAND_BY
  },
  {
    name: 'Liga de Dobles por Niveles',
    description: 'Dos categorías, conteo simple, finalizada.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.DOUBLES,
    type: TournamentType.LEAGUE,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: ['Nivel 1', 'Nivel 2'],
    competitorCount: 8,
    settings: { ...DEFAULT_LEAGUE_SETTINGS },
    status: TournamentStatus.FINISHED
  },

  // ---- Torneos grandes (+30 jugadores) ----

  // Padel playoff 32 parejas — en curso (primera ronda jugada, cuadro completo visible)
  {
    name: 'Gran Slam de Pádel',
    description: 'Cuadro de 32 parejas. El torneo más grande del año.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 32,
    settings: {},
    status: TournamentStatus.ONGOING,
    phase: 'mid',
    completedRounds: 1
  },

  // Padel playoff 16 parejas — finalizado
  {
    name: 'Copa Federación de Pádel',
    description: 'Cuadro de 16 parejas, ya finalizado.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.TWO_SETS_SUPER_TIEBREAK,
    categories: null,
    competitorCount: 16,
    settings: {},
    status: TournamentStatus.FINISHED
  },

  // Padel playoff 32 parejas por categorías — stand_by
  {
    name: 'Open Nacional de Pádel',
    description: 'Cuadro de 32 parejas dividido en Categoría A y B. Inscripción abierta.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: ['Categoría A', 'Categoría B'],
    competitorCount: 32,
    maxCompetitors: 32,
    settings: {},
    status: TournamentStatus.STAND_BY
  },

  // Tennis singles playoff 32 jugadores — recién iniciado (cuadro completo visible)
  {
    name: 'Abierto de Tenis 32 Singles',
    description: 'Cuadro de 32 jugadores individuales, recién iniciado.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 32,
    settings: {},
    status: TournamentStatus.ONGOING,
    phase: 'just_started'
  },

  // Tennis singles playoff 64 jugadores — stand_by, inscripción abierta
  {
    name: 'Torneo Nacional de Tenis',
    description: 'Cuadro de 64 jugadores. Inscripción abierta, ya hay 40 anotados.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.TWO_SETS_SUPER_TIEBREAK,
    categories: null,
    competitorCount: 40,
    maxCompetitors: 64,
    settings: {},
    status: TournamentStatus.STAND_BY
  },

  // Padel Americano 16 jugadores — en curso, mitad del torneo
  {
    name: 'Americano de Pádel Copa de Oro',
    description: 'Americano con 16 jugadores, rotación de parejas.',
    discipline: Discipline.PADEL,
    subDiscipline: null,
    type: TournamentType.AMERICANO,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    categories: null,
    competitorCount: 16,
    settings: { ...DEFAULT_AMERICANO_SETTINGS, swapPartnersEachRound: true },
    status: TournamentStatus.ONGOING,
    phase: 'mid',
    completedRounds: 3
  },

  // Tennis doubles playoff 16 parejas — finalizado
  {
    name: 'Copa Dobles Aniversario 50',
    description: 'Cuadro de 16 parejas de dobles, edición especial finalizada.',
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.DOUBLES,
    type: TournamentType.PLAYOFF,
    scoreFormat: ScoreFormat.THREE_SETS,
    categories: null,
    competitorCount: 16,
    settings: {},
    status: TournamentStatus.FINISHED
  }
]

// ---------------------------------------------------------------------------
// Tournament creation + simulation
// ---------------------------------------------------------------------------

async function buildTournament(spec: TournamentSpec, organizerId: number, pool: User[]): Promise<void> {
  const tournament = new Tournament()

  tournament.ownerId = organizerId
  tournament.name = spec.name
  tournament.description = spec.description
  tournament.status = TournamentStatus.STAND_BY
  tournament.discipline = spec.discipline
  tournament.subDiscipline = spec.discipline === Discipline.TENNIS ? spec.subDiscipline : null
  tournament.type = spec.type
  tournament.scoreFormat = spec.scoreFormat
  tournament.startDate = startDateFor(spec.status)
  tournament.startTime = randomItem(['09:00', '10:30', '14:00', '18:30', '20:00', null])
  tournament.location = randomItem(VENUES)
  tournament.categories = spec.categories
  tournament.maxCompetitors = spec.maxCompetitors ?? spec.competitorCount
  tournament.settings = spec.settings
  tournament.currentRound = 0
  tournament.createdAt = new Date()
  tournament.updatedAt = new Date()
  await tournament.save()

  await registerCompetitors(tournament, pool, spec.competitorCount, spec.categories)

  if (spec.status === TournamentStatus.STAND_BY) {
    return
  }

  // Ongoing / finished tournaments are driven through the real engine.
  tournament.status = TournamentStatus.ONGOING
  await createRound(tournament, 1)

  if (spec.status === TournamentStatus.FINISHED) {
    await playFullRounds(tournament, 60)

    return
  }

  switch (spec.phase ?? 'just_started') {
    case 'just_started':
      break
    case 'partial':
      await playCurrentRound(tournament, 0.5)
      break
    case 'mid':
      await playFullRounds(tournament, spec.completedRounds ?? 2)
      break
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log('Seeding demo database...\n')

  const { organizer, players } = await createUsers(64)

  console.log(`\nCreating ${SPECS.length} tournaments...`)

  let index = 0

  for (const spec of SPECS) {
    index++
    await buildTournament(spec, organizer.id, players)
    console.log(`  [${index}/${SPECS.length}] ${spec.name}`)
  }

  const [{ tournaments }, { competitors }, { matches }] = await DB.withConnection(async (conn) => {
    return Promise.all([
      conn.query('SELECT COUNT(*) AS tournaments FROM tournaments').then((r) => r[0]),
      conn.query('SELECT COUNT(*) AS competitors FROM competitors').then((r) => r[0]),
      conn.query('SELECT COUNT(*) AS matches FROM matches').then((r) => r[0])
    ])
  })

  console.log(
    `\nDone. ${
      players.length + 1
    } users, ${tournaments} tournaments, ${competitors} competitors, ${matches} matches created.`
  )
  console.log('Organizer login: demo-organizer@gmail.com / 123qwe')
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
