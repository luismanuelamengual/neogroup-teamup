import { DB } from '@neogroup/neorm'

/**
 * Base schema for the TeamUp application.
 * DDL is engine-aware so the same migration runs on PostgreSQL and SQLite.
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
        password_hash VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        nickname VARCHAR(100),
        profile VARCHAR(20),
        created_at ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id ${ID},
        owner_id INTEGER NOT NULL REFERENCES users (id),
        name VARCHAR(150) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'stand_by',
        discipline VARCHAR(20) NOT NULL,
        type VARCHAR(20) NOT NULL,
        score_format VARCHAR(30) NOT NULL,
        start_date DATE NOT NULL,
        location VARCHAR(255),
        max_competitors INTEGER NOT NULL,
        settings TEXT,
        current_round INTEGER NOT NULL DEFAULT 0,
        created_at ${TIMESTAMP},
        updated_at ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS competitors (
        id ${ID},
        tournament_id INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users (id),
        partner_user_id INTEGER REFERENCES users (id),
        partner_name VARCHAR(150),
        display_name VARCHAR(255) NOT NULL,
        created_at ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS rounds (
        id ${ID},
        tournament_id INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at ${TIMESTAMP}
      )
    `)

    await DB.execute(`
      CREATE TABLE IF NOT EXISTS matches (
        id ${ID},
        tournament_id INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
        round_id INTEGER NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        home_competitor_ids TEXT NOT NULL,
        away_competitor_ids TEXT,
        score TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        winner VARCHAR(10),
        created_at ${TIMESTAMP},
        updated_at ${TIMESTAMP}
      )
    `)

    await DB.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_owner ON tournaments (owner_id)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_competitors_tournament ON competitors (tournament_id)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_competitors_user ON competitors (user_id)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_rounds_tournament ON rounds (tournament_id)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches (tournament_id)')
    await DB.execute('CREATE INDEX IF NOT EXISTS idx_matches_round ON matches (round_id)')
  }
}
