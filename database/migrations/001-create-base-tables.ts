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
          createdAt ${TIMESTAMP}
        )
      `)

      // Seed the three initial organizations.
      await conn.execute(`INSERT INTO organizations (name, domainName) VALUES ('Demo', 'demo')`)
      await conn.execute(`INSERT INTO organizations (name, domainName) VALUES ('Club Alemán', 'club-aleman')`)
      await conn.execute(`INSERT INTO organizations (name, domainName) VALUES ('Punto Deporte', 'punto-deporte')`)

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
          createdAt ${TIMESTAMP},
          UNIQUE (organizationId, email)
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
          partnerName VARCHAR(150),
          displayName VARCHAR(255) NOT NULL,
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
          settings ${JSON_TYPE},
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
      // is a single award (organization + catalogue category + player) worth
      // `points`, valid until `expirationDate` (one year after it is granted).
      // The rankings browser sums the still-valid rows per player and category.
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS rankings (
          id ${ID},
          organizationId INTEGER NOT NULL REFERENCES organizations (id),
          categoryId INTEGER NOT NULL REFERENCES categories (id),
          userId INTEGER NOT NULL REFERENCES users (id),
          points INTEGER NOT NULL DEFAULT 0,
          expirationDate ${TIMESTAMP},
          createdAt ${TIMESTAMP}
        )
      `)

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
    })
  }
}
