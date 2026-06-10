# NeoGroup TeamUp

Web application to create and play tennis & padel tournaments and leagues.

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **MUI** for UI components, **SASS** (`{Component}.styles.scss`) for styling
- **Auth.js v5** (Google + email/password)
- **next-intl** for i18n (Spanish by default, English included)
- **@neogroup/neorm** entities for database access (PostgreSQL)
- **zustand** for client stores

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env.local
   ```

   Fill in `AUTH_SECRET` (`openssl rand -base64 32`), the Google OAuth credentials and the `DB_*` variables pointing to your PostgreSQL instance.

3. Run database migrations:

   ```bash
   npm run db:migrate
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

## Project structure

```
database/migrations/   Database migrations (run with npm run db:migrate)
scripts/migrate.ts     Migrations runner
messages/              i18n catalogs (es, en)
src/auth.ts            Auth.js configuration (Google + credentials)
src/proxy.ts           Route protection (Next.js proxy)
src/i18n/request.ts    next-intl configuration (locale cookie)
src/app/
  _actions/            Server actions
  _components/         Shared components
  _hooks/              Shared hooks
  _models/             NeORM entities, DTOs and domain types
  _stores/             zustand stores
  _utils/              Score helpers, tournament engine, standings, queries
  (auth)/              Login, register, profile selection
  (organizer)/         Organizer profile pages (/organizer/...)
  (player)/            Player profile pages (/player/...)
  (main)/              Shared pages (My account)
```

## Domain notes

- **Profiles**: each user picks Organizer or Player on first login and can switch from the avatar menu.
- **Tournament types**: league (round robin), americano (padel only, optional partner swapping per round) and playoff (knockout bracket with byes).
- **Score formats**: 3 sets, 2 sets + super tiebreak, or a basic counter. Walkovers (W.O.) are supported everywhere.
- The organizer starts the tournament, closes each round once all results are loaded and opens the next one; pairings are computed automatically based on the tournament type.
- Players register from the tournament page (or via the shared WhatsApp link `/player/tournaments/:id/join`), choosing a platform user or a free-text name as partner in doubles disciplines.
- Avatars come from Gravatar based on the account email.
