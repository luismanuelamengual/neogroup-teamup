import { DB } from '@neogroup/neorm'

/**
 * Base schema for the TeamUp application.
 * DDL is engine-aware so the same migration runs on PostgreSQL and SQLite.
 *
 * Enum-like columns (status, discipline, subDiscipline, type, scoreFormat,
 * winner, rounds.type) are stored as INTEGER. Their values map to the numeric
 * enums of the corresponding models (TournamentStatus, Discipline,
 * SubDiscipline, TournamentType, ScoreFormat, MatchStatus, MatchSide,
 * RoundStatus, RoundType).
 *
 * Array columns (matches.homeCompetitorIds / awayCompetitorIds) use the native
 * PostgreSQL INT[] type. On SQLite — which
 * has no array type — they are stored as TEXT holding a JSON array (the models
 * cast them with `json` only on SQLite). The same applies to JSONB:
 * tournaments.settings is JSONB on PostgreSQL and TEXT on SQLite.
 */
const IS_SQLITE = (process.env.DB_DRIVER ?? 'postgres') === 'sqlite'
const ID = IS_SQLITE ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'
const TIMESTAMP = IS_SQLITE ? 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' : 'TIMESTAMP NOT NULL DEFAULT NOW()'
/** Array of integers: native INT[] on PostgreSQL, JSON-encoded TEXT on SQLite. */
const INT_ARRAY = IS_SQLITE ? 'TEXT' : 'INT[]'
/** Structured JSON payload: JSONB on PostgreSQL, TEXT on SQLite. */
const JSON_TYPE = IS_SQLITE ? 'TEXT' : 'JSONB'
/** Boolean column: native BOOLEAN on PostgreSQL, INTEGER (0/1) on SQLite. */
const BOOLEAN_FALSE = IS_SQLITE ? 'INTEGER NOT NULL DEFAULT 0' : 'BOOLEAN NOT NULL DEFAULT FALSE'

export default {
  name: '001-create-base-tables',

  async up(): Promise<void> {
    await DB.withConnection(async (conn) => {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS organizations (
          id ${ID},
          name VARCHAR(150) NOT NULL,
          domainName VARCHAR(100) NOT NULL UNIQUE,
          allowOrganizersCreation ${BOOLEAN_FALSE},
          timezone VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
          createdAt ${TIMESTAMP}
        )
      `)

      // Seed the three initial organizations.
      // org 1 & 2: organizers can self-register; org 3: players only (organizers created manually).
      const TRUE_VAL = IS_SQLITE ? '1' : 'TRUE'
      const FALSE_VAL = IS_SQLITE ? '0' : 'FALSE'

      await conn.execute(
        `INSERT INTO organizations (name, domainName, allowOrganizersCreation) VALUES ('Demo', 'demo', ${TRUE_VAL})`
      )
      await conn.execute(
        `INSERT INTO organizations (name, domainName, allowOrganizersCreation) VALUES ('Club Alemán', 'club-aleman', ${TRUE_VAL})`
      )
      await conn.execute(
        `INSERT INTO organizations (name, domainName, allowOrganizersCreation) VALUES ('Punto Deporte', 'punto-deporte', ${FALSE_VAL})`
      )

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id ${ID},
          organizationId INTEGER NOT NULL REFERENCES organizations (id),
          email VARCHAR(255) NOT NULL,
          passwordHash VARCHAR(255),
          firstName VARCHAR(100),
          lastName VARCHAR(100),
          nickname VARCHAR(100),
          phoneNumber VARCHAR(50),
          roleId INTEGER,
          emailVerified ${BOOLEAN_FALSE},
          createdAt ${TIMESTAMP},
          UNIQUE (organizationId, email)
        )
      `)

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
          id ${ID},
          userId INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          token VARCHAR(255) NOT NULL UNIQUE,
          expiresAt ${TIMESTAMP},
          createdAt ${TIMESTAMP}
        )
      `)

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id ${ID},
          userId INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          token VARCHAR(255) NOT NULL UNIQUE,
          expiresAt ${TIMESTAMP},
          createdAt ${TIMESTAMP}
        )
      `)

      // Catalogue of categories, scoped to an organization and a
      // discipline/subDiscipline. Tournaments materialise these into concrete
      // tournament_categories instances (see below); competitors, rounds and
      // matches point to a single tournament_categories row.
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS categories (
          id ${ID},
          organizationId INTEGER NOT NULL REFERENCES organizations (id),
          name VARCHAR(150) NOT NULL,
          discipline INTEGER NOT NULL,
          subDiscipline INTEGER
        )
      `)

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS tournaments (
          id ${ID},
          organizationId INTEGER NOT NULL REFERENCES organizations (id),
          ownerId INTEGER NOT NULL REFERENCES users (id),
          name VARCHAR(150) NOT NULL,
          description TEXT,
          status INTEGER NOT NULL DEFAULT 1,
          discipline INTEGER NOT NULL,
          subDiscipline INTEGER,
          type INTEGER NOT NULL,
          scoreFormat INTEGER NOT NULL,
          startDate VARCHAR(10) NOT NULL,
          startTime VARCHAR(5),
          location VARCHAR(255),
          settings ${JSON_TYPE},
          rankingSettings ${JSON_TYPE},
          createdAt ${TIMESTAMP},
          updatedAt ${TIMESTAMP}
        )
      `)

      // Concrete category instances of a tournament. A tournament always has at
      // least one: when the organizer defines categories there is one row per
      // category (categoryId set); when it has none there is a single row with
      // categoryId = NULL (the "single category"). maxCompetitors is the entry
      // limit of that instance.
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS tournament_categories (
          id ${ID},
          tournamentId INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
          categoryId INTEGER REFERENCES categories (id),
          maxCompetitors INTEGER NOT NULL
        )
      `)

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS competitors (
          id ${ID},
          tournamentCategoryId INTEGER NOT NULL REFERENCES tournament_categories (id) ON DELETE CASCADE,
          userId INTEGER REFERENCES users (id),
          partnerUserId INTEGER REFERENCES users (id),
          seedNumber INTEGER,
          createdAt ${TIMESTAMP}
        )
      `)

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS rounds (
          id ${ID},
          tournamentCategoryId INTEGER NOT NULL REFERENCES tournament_categories (id) ON DELETE CASCADE,
          number INTEGER NOT NULL,
          status INTEGER NOT NULL DEFAULT 1,
          type INTEGER NOT NULL,
          groupNumber INTEGER,
          active ${BOOLEAN_FALSE},
          createdAt ${TIMESTAMP}
        )
      `)

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS matches (
          id ${ID},
          tournamentCategoryId INTEGER NOT NULL REFERENCES tournament_categories (id) ON DELETE CASCADE,
          roundId INTEGER NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
          position INTEGER NOT NULL DEFAULT 0,
          homeCompetitorIds ${INT_ARRAY} NOT NULL,
          awayCompetitorIds ${INT_ARRAY},
          score TEXT,
          status INTEGER NOT NULL DEFAULT 1,
          winner INTEGER,
          createdAt ${TIMESTAMP},
          updatedAt ${TIMESTAMP}
        )
      `)

      // Ranking points awarded to players when a tournament finishes. Each row
      // is a single award (organization + player) worth `points`, valid until
      // `expirationDate` (one year after it is granted). categoryId is NULL for
      // tournaments without categories (no-category mode); when set it references
      // the catalogue category. The rankings browser sums the still-valid rows
      // per player and category.
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS rankings (
          id ${ID},
          organizationId INTEGER NOT NULL REFERENCES organizations (id),
          categoryId INTEGER REFERENCES categories (id),
          userId INTEGER NOT NULL REFERENCES users (id),
          points INTEGER NOT NULL DEFAULT 0,
          expirationDate ${TIMESTAMP},
          createdAt ${TIMESTAMP}
        )
      `)

      // Cached, pre-computed organization-wide stats for the organizer home
      // dashboard. One row per organization, refreshed at most once every 24h
      // (or sooner if a match has been edited). See services/dashboard.ts.
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS organization_statistics (
          id ${ID},
          organizationId INTEGER NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE CASCADE,
          tournamentsTotal INTEGER NOT NULL DEFAULT 0,
          tournamentsActive INTEGER NOT NULL DEFAULT 0,
          tournamentsFinished INTEGER NOT NULL DEFAULT 0,
          competitorsTotal INTEGER NOT NULL DEFAULT 0,
          avgCompetitors REAL NOT NULL DEFAULT 0,
          distinctPlayers INTEGER NOT NULL DEFAULT 0,
          matchesTotal INTEGER NOT NULL DEFAULT 0,
          matchesPlayed INTEGER NOT NULL DEFAULT 0,
          matchesPending INTEGER NOT NULL DEFAULT 0,
          rankingPointsAwarded INTEGER NOT NULL DEFAULT 0,
          rankedPlayers INTEGER NOT NULL DEFAULT 0,
          updatedAt ${TIMESTAMP}
        )
      `)

      // Cached, pre-computed per-player stats for the player home dashboard.
      // One row per player (user), refreshed at most once every 24h (or sooner
      // if one of the player's matches has been edited). See services/dashboard.ts.
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS player_statistics (
          id ${ID},
          playerId INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
          tournamentsPlayed INTEGER NOT NULL DEFAULT 0,
          activeTournaments INTEGER NOT NULL DEFAULT 0,
          matchesPlayed INTEGER NOT NULL DEFAULT 0,
          matchesWon INTEGER NOT NULL DEFAULT 0,
          winRate INTEGER NOT NULL DEFAULT 0,
          titles INTEGER NOT NULL DEFAULT 0,
          podiums INTEGER NOT NULL DEFAULT 0,
          rankingPoints INTEGER NOT NULL DEFAULT 0,
          bestRankingPosition INTEGER NOT NULL DEFAULT 0,
          updatedAt ${TIMESTAMP}
        )
      `)

      await conn.execute('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (userId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_organization ON users (organizationId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_categories_lookup ON categories (organizationId, discipline)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_organization ON tournaments (organizationId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_owner ON tournaments (ownerId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status)')
      await conn.execute(
        'CREATE INDEX IF NOT EXISTS idx_tournament_categories_tournament ON tournament_categories (tournamentId)'
      )
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_competitors_user ON competitors (userId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_competitors_category ON competitors (tournamentCategoryId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_rounds_category ON rounds (tournamentCategoryId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_rounds_type ON rounds (tournamentCategoryId, type)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_rounds_active ON rounds (tournamentCategoryId, active)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_matches_category ON matches (tournamentCategoryId)')
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_matches_round ON matches (roundId)')
      await conn.execute(
        'CREATE INDEX IF NOT EXISTS idx_rankings_org_category ON rankings (organizationId, categoryId)'
      )
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_rankings_user ON rankings (userId)')
      await conn.execute(
        'CREATE INDEX IF NOT EXISTS idx_organization_statistics_org ON organization_statistics (organizationId)'
      )
      await conn.execute('CREATE INDEX IF NOT EXISTS idx_player_statistics_player ON player_statistics (playerId)')
    })
  }
}
