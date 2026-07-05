import { DB, Schema } from '@neogroup/neorm'

/**
 * Base schema for the TeamUp application.
 *
 * The DDL is fully engine-agnostic: it is described once through neorm's
 * `Schema` builder and compiled to the right dialect for the active data source
 * (PostgreSQL in production, SQLite in tests). neorm handles every difference
 * that this migration used to branch on by hand:
 *
 *   - `increments('id')` → SERIAL PRIMARY KEY / INTEGER PRIMARY KEY AUTOINCREMENT
 *   - `boolean(...)`      → BOOLEAN / INTEGER (0-1)
 *   - `timestamp().useCurrent()` → DEFAULT NOW()/CURRENT_TIMESTAMP
 *   - `decimal(...)`      → NUMERIC(p,s)
 *
 * Enum-like columns (status, discipline, subDiscipline, type, scoreFormat,
 * winner, rounds.type) are stored as INTEGER. Their values map to the numeric
 * enums of the corresponding models (TournamentStatus, Discipline,
 * SubDiscipline, TournamentType, ScoreFormat, MatchStatus, MatchSide,
 * RoundStatus, RoundType).
 *
 * Array columns (organizations.allowedRegistrationRoles,
 * matches.homeCompetitorIds / awayCompetitorIds) use `integerArray()`: native
 * INT[] on PostgreSQL, a JSON-encoded TEXT column on SQLite (the models cast
 * them with `array`/`json` only on SQLite). The same applies to `jsonb()`
 * (tournaments.settings / rankingSettings): JSONB on PostgreSQL, TEXT on SQLite.
 */
export default {
  name: '001-create-base-tables',

  async up(): Promise<void> {
    await DB.transaction(async () => {
      await Schema.createIfNotExists('organizations', (table) => {
        table.increments('id')
        table.string('name', 150)
        table.string('domainName', 100).unique()
        // Roles allowed to self-register (ORGANIZER=1, PLAYER=2). Empty by default.
        table.integerArray('allowedRegistrationRoles').default([])
        table.string('timezone', 64).default('America/Argentina/Buenos_Aires')
        table.decimal('serviceFeePercentage', 5, 2).default(4)
        table.timestamp('createdAt').useCurrent()
      })

      // Seed the three initial organizations.
      // demo: no self-registration allowed (empty roles array).
      // club-aleman: players and organizers can self-register.
      // punto-deporte: players only (organizers must be created manually).
      // Role values: ORGANIZER=1, PLAYER=2
      await DB.table('organizations').insert([
        { name: 'Demo', domainName: 'demo', allowedRegistrationRoles: [] },
        { name: 'Club Alemán', domainName: 'club-aleman', allowedRegistrationRoles: [1, 2] },
        { name: 'Punto Deporte', domainName: 'punto-deporte', allowedRegistrationRoles: [2] }
      ])

      await Schema.createIfNotExists('users', (table) => {
        table.increments('id')
        table.integer('organizationId')
        table.string('email', 255)
        table.string('passwordHash', 255).nullable()
        table.string('firstName', 100).nullable()
        table.string('lastName', 100).nullable()
        table.string('nickname', 100).nullable()
        table.string('phoneNumber', 50).nullable()
        table.integer('roleId').nullable()
        table.boolean('emailVerified').default(false)
        table.boolean('active').default(true)
        table.timestamp('createdAt').useCurrent()

        table.unique(['organizationId', 'email'])
        table.index('organizationId', 'idx_users_organization')
        table.foreign('organizationId').references('id').on('organizations')
      })

      await Schema.createIfNotExists('email_verification_tokens', (table) => {
        table.increments('id')
        table.integer('userId')
        table.string('token', 255).unique()
        table.timestamp('expiresAt').useCurrent()
        table.timestamp('createdAt').useCurrent()

        table.foreign('userId').references('id').on('users').onDelete('cascade')
      })

      await Schema.createIfNotExists('password_reset_tokens', (table) => {
        table.increments('id')
        table.integer('userId')
        table.string('token', 255).unique()
        table.timestamp('expiresAt').useCurrent()
        table.timestamp('createdAt').useCurrent()

        table.index('userId', 'idx_password_reset_tokens_user')
        table.foreign('userId').references('id').on('users').onDelete('cascade')
      })

      // Catalogue of categories, scoped to an organization and a
      // discipline/subDiscipline. Tournaments materialise these into concrete
      // tournament_categories instances (see below); competitors, rounds and
      // matches point to a single tournament_categories row.
      await Schema.createIfNotExists('categories', (table) => {
        table.increments('id')
        table.integer('organizationId')
        table.string('name', 150)
        table.integer('discipline')
        table.integer('subDiscipline').nullable()

        table.index(['organizationId', 'discipline'], 'idx_categories_lookup')
        table.foreign('organizationId').references('id').on('organizations')
      })

      await Schema.createIfNotExists('tournaments', (table) => {
        table.increments('id')
        table.integer('organizationId')
        table.integer('ownerId')
        table.string('name', 150)
        table.text('description').nullable()
        table.integer('status').default(1)
        table.integer('discipline')
        table.integer('subDiscipline').nullable()
        table.integer('type')
        table.integer('scoreFormat')
        table.string('startDate', 10)
        table.string('startTime', 5).nullable()
        table.string('location', 255).nullable()
        table.jsonb('settings').nullable()
        table.jsonb('rankingSettings').nullable()
        table.boolean('paid').default(false)
        table.decimal('entryFee', 12, 2).nullable()
        table.string('currency', 3).default('ARS')
        table.timestamp('createdAt').useCurrent()
        table.timestamp('updatedAt').useCurrent()

        table.index('organizationId', 'idx_tournaments_organization')
        table.index('ownerId', 'idx_tournaments_owner')
        table.index('status', 'idx_tournaments_status')
        table.foreign('organizationId').references('id').on('organizations')
        table.foreign('ownerId').references('id').on('users')
      })

      // Mercado Pago account a tournament organizer (an organizer-role user)
      // connects via OAuth so the platform can create split payments on their
      // behalf. Kept in a dedicated table — never eager-loaded with users — so
      // the access/refresh tokens are never serialized into a UserDto.
      await Schema.createIfNotExists('mercadopago_accounts', (table) => {
        table.increments('id')
        table.integer('userId').unique()
        table.string('mpUserId', 64)
        table.text('accessToken')
        table.text('refreshToken').nullable()
        table.text('publicKey').nullable()
        table.boolean('liveMode').nullable()
        table.text('scope').nullable()
        table.timestamp('expiresAt').nullable()
        table.timestamp('createdAt').useCurrent()
        table.timestamp('updatedAt').useCurrent()

        table.index('userId', 'idx_mercadopago_accounts_user')
        table.foreign('userId').references('id').on('users').onDelete('cascade')
      })

      // Concrete category instances of a tournament. A tournament always has at
      // least one: when the organizer defines categories there is one row per
      // category (categoryId set); when it has none there is a single row with
      // categoryId = NULL (the "single category"). maxCompetitors is the entry
      // limit of that instance.
      await Schema.createIfNotExists('tournament_categories', (table) => {
        table.increments('id')
        table.integer('tournamentId')
        table.integer('categoryId').nullable()
        table.integer('maxCompetitors')

        table.index('tournamentId', 'idx_tournament_categories_tournament')
        table.foreign('tournamentId').references('id').on('tournaments').onDelete('cascade')
        table.foreign('categoryId').references('id').on('categories')
      })

      await Schema.createIfNotExists('competitors', (table) => {
        table.increments('id')
        table.integer('tournamentCategoryId')
        table.integer('userId').nullable()
        table.integer('partnerUserId').nullable()
        table.integer('seedNumber').nullable()
        table.timestamp('createdAt').useCurrent()

        table.index('userId', 'idx_competitors_user')
        table.index('tournamentCategoryId', 'idx_competitors_category')
        table.foreign('tournamentCategoryId').references('id').on('tournament_categories').onDelete('cascade')
        table.foreign('userId').references('id').on('users')
        table.foreign('partnerUserId').references('id').on('users')
      })

      await Schema.createIfNotExists('rounds', (table) => {
        table.increments('id')
        table.integer('tournamentCategoryId')
        table.integer('number')
        table.integer('status').default(1)
        table.integer('type')
        table.integer('groupNumber').nullable()
        table.boolean('active').default(false)
        table.timestamp('createdAt').useCurrent()

        table.index('tournamentCategoryId', 'idx_rounds_category')
        table.index(['tournamentCategoryId', 'type'], 'idx_rounds_type')
        table.index(['tournamentCategoryId', 'active'], 'idx_rounds_active')
        table.foreign('tournamentCategoryId').references('id').on('tournament_categories').onDelete('cascade')
      })

      await Schema.createIfNotExists('matches', (table) => {
        table.increments('id')
        table.integer('tournamentCategoryId')
        table.integer('roundId')
        table.integer('position').default(0)
        table.integerArray('homeCompetitorIds')
        table.integerArray('awayCompetitorIds').nullable()
        table.text('score').nullable()
        table.integer('status').default(1)
        table.integer('winner').nullable()
        table.timestamp('createdAt').useCurrent()
        table.timestamp('updatedAt').useCurrent()

        table.index('tournamentCategoryId', 'idx_matches_category')
        table.index('roundId', 'idx_matches_round')
        table.foreign('tournamentCategoryId').references('id').on('tournament_categories').onDelete('cascade')
        table.foreign('roundId').references('id').on('rounds').onDelete('cascade')
      })

      // Ranking points awarded to players when a tournament finishes. Each row
      // is a single award (organization + player) worth `points`, valid until
      // `expirationDate` (one year after it is granted). categoryId is NULL for
      // tournaments without categories; when set it references the catalogue
      // category. The rankings browser sums the still-valid rows per player and
      // category.
      await Schema.createIfNotExists('rankings', (table) => {
        table.increments('id')
        table.integer('organizationId')
        table.integer('categoryId').nullable()
        table.integer('userId')
        table.integer('points').default(0)
        table.timestamp('expirationDate').useCurrent()
        table.timestamp('createdAt').useCurrent()

        table.index(['organizationId', 'categoryId'], 'idx_rankings_org_category')
        table.index('userId', 'idx_rankings_user')
        table.foreign('organizationId').references('id').on('organizations')
        table.foreign('categoryId').references('id').on('categories')
        table.foreign('userId').references('id').on('users')
      })

      // Cached, pre-computed organization-wide stats for the organizer home
      // dashboard. One row per organization, refreshed at most once every 24h
      // (or sooner if a match has been edited). See services/dashboard.ts.
      await Schema.createIfNotExists('organization_statistics', (table) => {
        table.increments('id')
        table.integer('organizationId').unique()
        table.integer('tournamentsTotal').default(0)
        table.integer('tournamentsActive').default(0)
        table.integer('tournamentsFinished').default(0)
        table.integer('competitorsTotal').default(0)
        table.float('avgCompetitors').default(0)
        table.integer('distinctPlayers').default(0)
        table.integer('matchesTotal').default(0)
        table.integer('matchesPlayed').default(0)
        table.integer('matchesPending').default(0)
        table.integer('rankingPointsAwarded').default(0)
        table.integer('rankedPlayers').default(0)
        table.timestamp('updatedAt').useCurrent()

        table.index('organizationId', 'idx_organization_statistics_org')
        table.foreign('organizationId').references('id').on('organizations').onDelete('cascade')
      })

      // Cached, pre-computed per-player stats for the player home dashboard.
      // One row per player (user), refreshed at most once every 24h (or sooner
      // if one of the player's matches has been edited). See services/dashboard.ts.
      await Schema.createIfNotExists('player_statistics', (table) => {
        table.increments('id')
        table.integer('playerId').unique()
        table.integer('tournamentsPlayed').default(0)
        table.integer('activeTournaments').default(0)
        table.integer('matchesPlayed').default(0)
        table.integer('matchesWon').default(0)
        table.integer('winRate').default(0)
        table.integer('titles').default(0)
        table.integer('podiums').default(0)
        table.integer('rankingPoints').default(0)
        table.integer('bestRankingPosition').default(0)
        table.timestamp('updatedAt').useCurrent()

        table.index('playerId', 'idx_player_statistics_player')
        table.foreign('playerId').references('id').on('users').onDelete('cascade')
      })

      // Registration payment for a paid tournament. A row is created (status
      // PENDING) when a player initiates the checkout for a paid tournament; it
      // snapshots the intended entry (tournamentCategoryId, userId, optional
      // partnerUserId) and the money split at that moment (amount, the service
      // fee percentage/amount that goes to TeamUp and the remainder for the
      // organizer). When Mercado Pago confirms the payment (webhook) the status
      // becomes APPROVED and the competitor is created, linked via competitorId.
      // Status values map to the PaymentStatus enum (PENDING=1, APPROVED=2,
      // REJECTED=3, CANCELLED=4, REFUNDED=5).
      await Schema.createIfNotExists('tournament_payments', (table) => {
        table.increments('id')
        table.integer('organizationId')
        table.integer('tournamentId')
        table.integer('tournamentCategoryId')
        table.integer('userId')
        table.integer('partnerUserId').nullable()
        table.integer('status').default(1)
        table.decimal('amount', 12, 2)
        table.string('currency', 3).default('ARS')
        table.decimal('serviceFeePercentage', 5, 2)
        table.decimal('serviceFeeAmount', 12, 2)
        table.decimal('organizerAmount', 12, 2)
        table.string('provider', 32).default('mercadopago')
        table.string('preferenceId', 255).nullable()
        table.string('mpPaymentId', 64).nullable()
        table.text('initPoint').nullable()
        table.integer('competitorId').nullable()
        table.timestamp('createdAt').useCurrent()
        table.timestamp('updatedAt').useCurrent()

        table.index('tournamentId', 'idx_tournament_payments_tournament')
        table.index('userId', 'idx_tournament_payments_user')
        table.index('status', 'idx_tournament_payments_status')
        table.index('preferenceId', 'idx_tournament_payments_preference')
        table.foreign('organizationId').references('id').on('organizations')
        table.foreign('tournamentId').references('id').on('tournaments').onDelete('cascade')
        table.foreign('tournamentCategoryId').references('id').on('tournament_categories').onDelete('cascade')
        table.foreign('userId').references('id').on('users')
        table.foreign('partnerUserId').references('id').on('users')
        table.foreign('competitorId').references('id').on('competitors').onDelete('set null')
      })
    })
  }
}
