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

The codebase is organized in **feature modules** inside the `app/` directory (which lives at the project root — there is no `src/` folder). Each feature module is a Next.js route group — `(auth)`, `(account)`, `(tournaments)` — that encapsulates **everything** related to that feature: pages, API endpoints, components, actions, entities, models, services, stores, hooks, utils and texts (i18n).

```
app/
  layout.tsx             Root layout (theme, i18n provider, snackbar)
  page.tsx               Entry point: redirects to the right home per session/profile
  globals.scss           Global styles
  components/            Shared components used by any module (AppShell, AppLayout, ThemeRegistry, ...)
  actions/               Shared FE actions (e.g. executeRequest, the REST client helper)
  models/                Shared FE models (e.g. ApiResult)
  stores/                Shared zustand stores (e.g. notifications)
  utils/                 Shared utilities (gravatar, api-server helpers for route handlers)
  lang/                  Shared texts (common, nav) + next-intl request config (request.ts)
  (auth)/                Authentication module
  (account)/             My-account module
  (tournaments)/         Tournaments module
proxy.ts                 Route protection (Next.js proxy — must live at the project root)
database/migrations/     Database migrations (run with npm run db:migrate)
scripts/migrate.ts       Migrations runner
```

### Anatomy of a feature module

Every feature module can contain any of these folders (only create the ones the module needs):

```
app/(module)/
  components/      React components of this module ({Component}.tsx + {Component}.styles.scss)
  actions/         FE actions: thin client-side wrappers around the REST API (e.g. getTournaments, loginUser)
  entities/        BE entities of @neogroup/neorm (one class per database table)
  models/          FE models: DTOs, domain types and request payloads shared between actions and API handlers
  stores/          zustand stores scoped to this module
  hooks/           React hooks scoped to this module
  utils/           Pure utilities scoped to this module
  services/        BE services: server-side data manipulation (queries, business logic helpers)
  lang/            Texts of this module (es.json, en.json) — see "Internationalization"
  (pages)/         All the pages of this module (route group: it does not affect the URL)
  (api)/           All the API endpoints of this module, under (api)/api/... (URLs keep the /api prefix)
```

Current modules:

```
app/(auth)/        Login, register, profile selection
  services/        Auth.js configuration (auth.ts, auth.config.ts)
  entities/        User
  models/          user.ts (Profile, UserDto, RegisterInput, getUserDisplayName), next-auth.d.ts
  (pages)/         /login, /register, /select-profile
  (api)/           /api/auth/[...nextauth], /api/users

app/(account)/     My account
  (pages)/         /account
  (api)/           /api/account, /api/account/locale, /api/account/profile

app/(tournaments)/ Tournaments (the core feature)
  entities/        Tournament, Competitor, Round, Match
  models/          types.ts (domain types), dtos.ts (serializable DTOs), inputs.ts (API payloads)
  services/        queries.ts (data fetching), tournament-engine.ts (pairings), tournament-helpers.ts
  utils/           score.ts, standings.ts
  (pages)/         /tournaments, /tournaments/new, /tournaments/search, /tournaments/[id], /tournaments/[id]/join
  (api)/           /api/tournaments/..., /api/matches/..., /api/registrations/...
```

### Conventions — where do I put new code?

- **A new page** → `app/(module)/(pages)/<route>/page.tsx`. Pages are role-agnostic by feature: when organizers and players see different things, the page checks `session.user.profile` and renders the proper view (see `app/(tournaments)/(pages)/tournaments/page.tsx`).
- **A new API endpoint** → `app/(module)/(api)/api/<endpoint>/route.ts`. All endpoints live under the `/api/...` URL prefix. Wrap handlers with `withAuth` from `app/utils/api-server.ts` when they require a session.
- **A component used only by one module** → `app/(module)/components/`. Used by several modules → `app/components/`.
- **A FE action** (function called from components that hits the REST API) → `app/(module)/actions/`. Generic helpers → `app/actions/`.
- **A neorm entity** (database table) → `entities/` of the module that owns the concept.
- **FE models** (DTOs, types, request payloads) → `models/` of the module. Cross-module models (like `ApiResult`) → `app/models/`.
- **BE logic** (queries, business rules executed on the server) → `app/(module)/services/`.
- **Texts** → the module's `lang/es.json` and `lang/en.json` (see below).
- **A new feature module** → create `app/(my-feature)/` with the folders you need, add its `lang/` files to `app/lang/request.ts`, and document it here.

Cross-module imports are allowed but should be the exception (e.g. the tournaments module imports `UserDto` from the auth module, which owns the user concept). Shared code that several modules depend on belongs at the `app/` root instead.

Imports are always absolute via the `@/` alias (enforced by ESLint), e.g. `import { auth } from '@/app/(auth)/services/auth'`.

> **Note:** `proxy.ts` (route protection) must stay at the project root — Next.js requires it next to `app/`, it cannot live inside a module.

### Internationalization (distributed `lang/` folders)

There is no central message catalog. Every module owns its texts inside its own `lang/` folder, so everything related to a feature — including its texts — is encapsulated in the module:

```
app/lang/es.json                  Shared namespaces: common, nav
app/(auth)/lang/es.json           Namespaces: auth, profileSelect
app/(account)/lang/es.json        Namespace: account
app/(tournaments)/lang/es.json    Namespaces: tournaments, organizer, player, score
```

Rules:

- Each module file declares its **own top-level namespaces** (never reuse a namespace owned by another module). Components consume them as usual with `useTranslations('namespace')` / `getTranslations('namespace')`.
- `app/lang/request.ts` is the next-intl request config: it statically imports every module's `lang/` files and merges them into the full catalog. **When you add a `lang/` folder to a new module, register its files there** (two import lines and two spreads).
- Both locales (`es.json` and `en.json`) must define the same keys.

## Domain notes

- **Profiles**: each user picks Organizer or Player on first login and can switch from the avatar menu. Pages are shared between profiles: the same `/tournaments` routes render the organizer or the player experience based on the active profile.
- **Tournament types**: league (round robin), americano (padel only, optional partner swapping per round) and playoff (knockout bracket with byes).
- **Score formats**: 3 sets, 2 sets + super tiebreak, or a basic counter. Walkovers (W.O.) are supported everywhere.
- The organizer starts the tournament, closes each round once all results are loaded and opens the next one; pairings are computed automatically based on the tournament type.
- Players register from the tournament page (or via the shared WhatsApp link `/tournaments/:id/join`), choosing a platform user or a free-text name as partner in doubles disciplines.
- Avatars come from Gravatar based on the account email.
