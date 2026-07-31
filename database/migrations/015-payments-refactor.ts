import { DB, Schema } from '@neogroup/neorm'

/**
 * Rebuilds how tournaments are charged: the player no longer pays through the
 * platform, the organizer settles TeamUp's service fee afterwards.
 *
 * **Before.** A paid registration went through Mercado Pago *Split payments*:
 * the player paid the entry fee with the organizer's connected account as the
 * collector and a `marketplace_fee` that was settled to TeamUp. That required
 * every organizer to complete an OAuth flow (`mercadopago_accounts`) and made
 * the registration itself asynchronous — the competitor was only created when
 * the webhook confirmed the payment (`tournament_payments`).
 *
 * **After.** Registration is free of charge inside the app: the player settles
 * the entry fee with the organizer off-platform (cash at the venue, transfer,
 * whatever they agree on) and the competitor is created immediately. What TeamUp
 * bills is the service fee over the tournaments that actually took place, which
 * the organizer/administrator pays from the new "Pagos" page in a single
 * Mercado Pago checkout against TeamUp's own account.
 *
 * The schema changes that follow from it:
 *
 *   - **`tournaments.paid` is resemantized** — it used to mean "this tournament
 *     charges an entry fee", it now means "the service fee of this tournament
 *     has already been settled to TeamUp". Whether a tournament has a cost is
 *     from now on derived from `entryFee > 0`, which is the value that was
 *     already carrying that information, so no column is added or dropped for
 *     it. Every existing row is reset to `false`: no tournament was ever
 *     charged through the old flow in production, so nothing is owed as paid.
 *   - **`tournaments.paidAt` / `tournaments.servicePaymentId`** record when and
 *     through which settlement it was paid.
 *   - **`service_payments`** is the settlement itself: one row per checkout,
 *     snapshotting the tournaments it covers and the amounts at that moment, so
 *     a later match or registration cannot retroactively change what was
 *     charged.
 *   - **`tournament_payments` and `mercadopago_accounts` are dropped.** The
 *     per-registration payment and the organizer OAuth credentials have no
 *     equivalent in the new flow — TeamUp collects with its own account
 *     (`MP_ACCESS_TOKEN`), so there is nothing left to connect.
 *
 * Idempotent: guarded by a column probe, so a second run (or a database created
 * after this change) is a no-op.
 */
export default {
  name: '015-payments-refactor',

  async up(): Promise<void> {
    if (await Schema.hasColumn('tournaments', 'paidAt')) {
      return
    }

    const isSqlite = (process.env.DB_DRIVER ?? 'postgres') === 'sqlite'

    await Schema.createIfNotExists('service_payments', (table) => {
      table.increments('id')
      table.integer('organizationId')
      // User that started the checkout (the organizer or the administrator).
      table.integer('userId')
      // Snapshot of the tournaments this settlement covers.
      table.integerArray('tournamentIds').default([])
      table.integer('competitorsCount').default(0)
      table.decimal('grossAmount', 12, 2).default(0)
      table.decimal('serviceFeePercentage', 5, 2).default(0)
      table.decimal('amount', 12, 2).default(0)
      table.string('currency', 3).default('ARS')
      table.integer('status').default(1)
      table.string('provider', 32).default('mercadopago')
      table.string('preferenceId', 255).nullable()
      table.string('mpPaymentId', 64).nullable()
      table.text('initPoint').nullable()
      table.timestamp('createdAt').useCurrent()
      table.timestamp('updatedAt').useCurrent()

      table.index('organizationId', 'idx_service_payments_organization')
      table.index('status', 'idx_service_payments_status')
      table.index('preferenceId', 'idx_service_payments_preference')
      table.foreign('organizationId').references('id').on('organizations')
      table.foreign('userId').references('id').on('users')
    })

    await Schema.table('tournaments', (table) => {
      table.timestamp('paidAt').nullable()
      table.integer('servicePaymentId').nullable()
    })

    // `paid` changes meaning here (see the note above), so every row starts over
    // as "not settled". Written through the query builder rather than raw SQL so
    // the boolean literal is rendered by each engine's grammar (PostgreSQL wants
    // `false`, SQLite stores 0).
    await DB.table('tournaments').where('id', '>', 0).update({ paid: false })

    // SQLite cannot attach a foreign key to an already-existing table, so the
    // constraint is PostgreSQL-only (production) — same trade-off as migrations
    // 008 and 013. The settlement service is what keeps the pointer consistent.
    if (!isSqlite) {
      await Schema.table('tournaments', (table) => {
        table.foreign('servicePaymentId').references('id').on('service_payments').onDelete('set null')
      })
    }

    // No equivalent in the new flow: registrations are not charged through the
    // platform any more, and TeamUp collects with its own Mercado Pago account.
    await Schema.dropIfExists('tournament_payments')
    await Schema.dropIfExists('mercadopago_accounts')
  }
}
