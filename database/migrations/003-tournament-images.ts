import { Schema } from '@neogroup/neorm'

/**
 * Picture for a tournament, kept in its own `tournament_images`
 * table — the same pattern already used by `mercadopago_accounts`: a
 * potentially sizeable payload (base64 data URL, TEXT) that must never be
 * fetched by a plain `tournaments` query, only by the specific code paths
 * that actually render the picture (they opt in with `.with('image')`; see
 * TournamentOptions.withImage in services/tournaments.ts).
 *
 * The frontend compresses the picture client-side before upload, so rows
 * stay a few hundred KB at most. Shown in the tournament listing cards, the
 * tournament detail header, and attached when a tournament is shared via
 * WhatsApp.
 */
export default {
  name: '003-tournament-images',

  async up(): Promise<void> {
    await Schema.createIfNotExists('tournament_images', (table) => {
      table.increments('id')
      table.integer('tournamentId').unique()
      table.text('image')
      table.timestamp('createdAt').useCurrent()
      table.timestamp('updatedAt').useCurrent()

      table.foreign('tournamentId').references('id').on('tournaments').onDelete('cascade')
    })
  }
}
