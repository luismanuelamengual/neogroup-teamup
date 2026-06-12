import { DB } from '@neogroup/neorm'

/**
 * Base schema for the TeamUp application.
 * DDL is engine-aware so the same migration runs on PostgreSQL and SQLite.
 *
 * Enum-like columns (status, discipline, subDiscipline, type, scoreFormat,
 * winner) are stored as INTEGER. Their values map to the numeric enums of
 * the corresponding models (TournamentStatus, Discipline, SubDiscipline,
 * TournamentType, ScoreFormat, MatchStatus, MatchSide, RoundStatus).
 */
const IS_SQLITE = (process.env.DB_DRIVER ?? 'postgres') === 'sqlite'
const ID = IS_SQLITE ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'
const TIMESTAMP = IS_SQLITE ? 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' : 'TIMESTAMP NOT NULL DEFAULT NOW()'

export default {
  name: '001-create-base-tables',

  async up(): Promise<void> {
    await DB.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id ${ID},
        email VARCHAR(255) NOT NULL UNIQUE,
        passwordHash VARCHAR(255),
        firstName VARCHAR(100),
        lastName VARCHAR(100),
        nickname VARCHAR(100),
        roleId INTEGER,
        createdAt ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id ${ID},
        ownerId INTEGER NOT NULL REFERENCES users (id),
        name VARCHAR(150) NOT NULL,
        description TEXT,
        status INTEGER NOT NULL DEFAULT 1,
        discipline INTEGER NOT NULL,
        subDiscipline INTEGER,
        type INTEGER NOT NULL,
        scoreFormat INTEGER NOT NULL,
        startDate DATE NOT NULL,
        location VARCHAR(255),
        maxCompetitors INTEGER NOT NULL,
        settings TEXT,
        currentRound INTEGER NOT NULL DEFAULT 0,
        createdAt ${TIMESTAMP},
        updatedAt ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS competitors (
        id ${ID},
        tournamentId INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
        userId INTEGER REFERENCES users (id),
        partnerUserId INTEGER REFERENCES users (id),
        partnerName VARCHAR(150),
        displayName VARCHAR(255) NOT NULL,
        createdAt ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS rounds (
        id ${ID},
        tournamentId INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        status INTEGER NOT NULL DEFAULT 1,
        createdAt ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS matches (
        id ${ID},
        tournamentId INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
        roundId INTEGER NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        homeCompetitorIds TEXT NOT NULL,
        awayCompetitorIds TEXT,
        score TEXT,
        status INTEGER NOT NULL DEFAULT 1,
        winner INTEGER,
        createdAt ${TIMESTAMP},
        updatedAt ${TIMESTAMP}
      )
    `)

    await DB.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_owner ON tournaments (ownerId)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_competitors_tournament ON competitors (tournamentId)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_competitors_user ON competitors (userId)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_rounds_tournament ON rounds (tournamentId)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches (tournamentId)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_matches_round ON matches (roundId)')
  }
}
