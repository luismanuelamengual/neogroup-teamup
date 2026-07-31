# NeoGroup TeamUp

Multi-tenant web application to create and play tennis & padel tournaments and leagues. Each client organization is served from its own subdomain (e.g. `club-aleman.teamup.ar`).

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **MUI** for UI components, **SASS** for styling
- **Auth.js v5** (Google + email/password, with email verification and password reset via Resend)
- **@neogroup/neorm** entities for database access (PostgreSQL)
- **zustand** for client stores
- **Serwist** service worker for PWA/offline support
- **Mercado Pago** checkout to settle TeamUp's service fee over the tournaments that were played
- UI is Spanish-only — there is currently no i18n layer wired up in the app

## Getting started

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   Fill in `AUTH_SECRET` (`openssl rand -base64 32`), the Google OAuth credentials, `RESEND_API_KEY` and the `DB_*` variables pointing to your PostgreSQL instance. For local development, since there is no subdomain on `localhost`, set `DEV_ORGANIZATION_DOMAIN` to the `domainName` of the organization you want to work against (see `app/utils/domains.ts`).

3. Run database migrations and seed demo data:

   ```bash
   yarn db:migrate
   yarn db:seed
   ```

4. Start the dev server:

   ```bash
   yarn dev
   ```

## Project structure

The codebase is organized in **feature modules** inside the `app/` directory (which lives at the project root — there is no `src/` folder). Each feature module is a Next.js route group that encapsulates **everything** related to that feature: pages, API endpoints, components, entities/models, services, stores, hooks and utils.

```
app/
  layout.tsx              Root layout (theme, GTM, snackbar)
  page.tsx                Entry point: redirects to the right home per session
  globals.scss            Global styles
  sw.ts                   Serwist service worker (PWA/offline support)
  components/             Shared components used by any module (Avatar, Loading, ThemeRegistry, ...)
  models/                 Shared entities & models (User, Organization, Role, ApiResponse, ApiException, ...)
  services/               Shared BE services (organizations, mercadopago, pwa)
  stores/                 Shared zustand stores (e.g. the signed-in user store)
  hooks/                  Shared hooks (useRequests — the fetch/executeRequest helper, useNotifications, ...)
  utils/                  Shared utilities (gravatar, domains, api-server helpers, users)
  (auth)/                 Authentication module (login, register, role selection, email verification, password reset)
  (public)/               Public/marketing module (landing page, offline fallback, PWA manifest)
  (protected)/            Wrapper for every module that requires a signed-in session (see below)
proxy.ts                  Route protection + subdomain-to-organization resolution (Next.js middleware — must live at the project root)
database/migrations/      Database migrations (run with yarn db:migrate)
scripts/migrate-database.ts     Migrations runner (yarn db:migrate)
scripts/reset-database.ts       Drops all tables and re-runs migrations (yarn db:reset)
scripts/seed-database.ts        Seeds demo/test data (yarn db:seed)
scripts/delete-organization.ts  Deletes an organization and its data (yarn db:delete-org)
```

`(protected)` is itself a route group (with its own shared `AppShell` component) containing one nested route group per protected feature:

```
app/(protected)/
  components/AppShell/    Shared shell (nav, layout) for every protected page
  (account)/               My-account module (profile, password)
  (tournaments)/            Tournaments module (create/manage/join tournaments, scoring, brackets)
  (home)/                   Home/dashboard module (organizer & player dashboards, stats)
  (payments)/               Payments module — settling TeamUp's service fee (organizer & administrator)
  (rankings)/               Rankings module
  (sites)/                  Sites (venues) module — administrator ABM + the catalogue tournaments pick from
  (categories)/             Categories module — administrator ABM of the category catalogue
```

### Anatomy of a feature module

Every feature module can contain any of these folders (only create the ones the module needs):

```
app/(module)/
  components/      React components of this module (see "Components" below)
  models/          neorm entities (Active Record classes, one per DB table, with relationships) AND
                    FE DTOs/types derived from them — both live together in this folder, there is no
                    separate `entities/` folder
  stores/          zustand stores scoped to this module
  hooks/           React hooks scoped to this module — this is also where API calls live (there is no
                    separate `actions/` layer; a hook calls `useRequests()`'s `executeRequest` directly)
  utils/            Pure utilities scoped to this module
  services/         BE services: server-side data manipulation (queries, business logic helpers)
  (pages)/          All the pages of this module (route group: it does not affect the URL)
  (api)/            All the API endpoints of this module, under (api)/api/... (URLs keep the /api prefix)
```

### Components

Every component lives in **its own folder**, named after the component, with the code in `index.tsx` and the styles in `index.scss`:

```
components/
  CustomComponent/
    index.tsx      The component (imports './index.scss' when it has styles)
    index.scss     The component styles (only when needed)
```

Imports stay clean thanks to the folder + index resolution: `import CustomComponent from '@/app/(module)/components/CustomComponent'`.

### Multi-tenancy (organizations)

The app is multi-tenant: every client is an `Organization` (`app/models/Organization.ts`) served from its own subdomain (`organizations.domainName`, e.g. `club-aleman.teamup.ar`). `proxy.ts` resolves the organization from the request's `Host` header (`app/utils/domains.ts`) and injects it as the `x-org-domain` header; API routes re-resolve it from the `Host` header directly (they're excluded from the middleware matcher) via `withApi`/`withAuth` (see "API endpoints" below).

Most tenant-scoped entities (`User`, `Tournament`, ...) declare a global `OrganizationScope` in their `booted()` hook, so queries are automatically filtered to the current organization. Each organization also configures its own `allowedRegistrationRoles`, `timezone` (used to schedule tournament starts), `serviceFeePercentage` (see "Service fee settlement" below) and `enabledDisciplines` — the subset of `Discipline` (padel, tennis) it offers, defaulting to both; every discipline selector (categories, rankings, tournament form) and the category/tournament creation services filter against it (`getEnabledDisciplines`, `app/(protected)/(tournaments)/services/organizations.ts`).

On `localhost` (no subdomain), the organization is taken from the `DEV_ORGANIZATION_DOMAIN` env var instead.

### Users and roles

A user has a **`roleId`** assigned once — `Role.ADMINISTRATOR = 1`, `Role.ORGANIZER = 2`, `Role.PLAYER = 3` (`app/models/Role.ts`) — and **it cannot be switched**. Organizers and players choose their role in the registration form; users signing in without a role (e.g. first Google login) pick it once at `/select-role`. **Administrators are never self-assignable**: they are created by the seed or a maintenance script (`isValidRole` / `ManageableRoles` only cover organizer and player).

> **Role ids start at 1, never 0.** A `0` would be falsy, so every `if (user.roleId)` would silently treat that role as "no role assigned". Adding the administrator shifted organizer/player from 1/2 to 2/3 (migration `007-shift-role-ids`); keep any future role above `0` and the only "no role" value stays `null`.

The signed-in user (including its `roleId`) lives in a **zustand store**: `useUserStore` in `app/stores/users.ts`, hydrated by `app/(protected)/layout.tsx` through `UserStoreHydrator`. Any client component that needs to take a decision based on the role reads it from this store via the `useUserRole` / `useIsOrganizer` / `useIsAdministrator` helpers. Server components and API handlers read the role from the session (`session.user.roleId`).

Pages are shared between roles: the same `/tournaments` routes render the organizer or the player experience based on the role. The **administrator** is the exception — its navigation (`AppShell`) only has `/home` (organization metrics, no tournament listing) and `/users` (the users ABM), and the tournaments/rankings pages redirect it back to `/home`.

### Users administration (`app/(protected)/(users)`)

The administrator manages the users of its organization from `/users`: search by name/email, filter by role, create, edit (including activate/deactivate), delete and trigger a password reset. Its endpoints are wrapped with **`withAdmin`** (`app/utils/api-server.ts`), the `withAuth` variant that also requires `Role.ADMINISTRATOR`.

Rules baked into `app/(protected)/(users)/services/users.ts`:

- Administrator accounts are never listed, edited or deleted from the UI, and only organizer/player can be assigned — an administrator can't lock itself out or escalate anybody.
- Listings drop the `activeScope` / `emailVerifiedScope` global scopes (banned and unverified accounts must be visible) but keep the `OrganizationScope`.
- **Creating a user** doesn't set a password: the account is created verified, with `passwordHash = null`, and gets an invitation email to choose its own password (`sendPasswordResetEmail(..., { invitation: true })` in `app/(auth)/services/passwords.ts`, shared with the public "forgot password" flow).
- **Deleting** is a real `DELETE`, so it is rejected when the user has activity attached (owned tournaments, registrations, ranking points or settlements); those accounts should be deactivated instead.

### Catalogues administration (`(sites)` and `(categories)`)

Two more administrator-only ABMs, built exactly like the users one (`withAdmin` endpoints, a `*Browser` component with search + pagination and a `*FormDialog`), reachable from `/sites` and `/categories`:

- **Sedes** (`app/(protected)/(sites)`, table `sites`: `id`, `organizationId`, `name`) — the venues a tournament can be played at. They replaced the free-text `tournaments.location` column, where the same club ended up spelled in as many ways as organizers there were; migration `008-sites` creates a site per distinct location and repoints every tournament at it through `tournaments.siteId`.
- **Categorías** (`app/(protected)/(categories)`, on the existing `categories` table) — the category catalogue, scoped to a **discipline** and nothing else. Categories used to be created on the fly from the tournament form, which split the rankings of a single category across near-duplicates ("4ta", "Cuarta", "4TA"). A category is a *division* ("Primera", "4ta"), not a modality: tennis categories used to carry a sub-discipline, but an interclubes encounter is played partly in singles and partly in doubles, so singles-vs-doubles belongs to the tournament (and to each match), never to the category — see migration `010-categories-drop-subdiscipline`, which also merges the categories that only differed by modality.

Both refuse to delete a row that is already in use (a site assigned to a tournament, a category used by a tournament or holding ranking points), and both reject duplicate names case-insensitively.

Organizers never type either value: they pick it from the reusable **`SiteSelector`** / **`CategorySelector`** components (each one in its own module's `components/` folder), used by the tournament form, the edit-tournament dialog, the tournament admin view and the rankings filters. When the catalogue is empty the selector renders disabled with a message pointing at the administrator. Reading the catalogues is open to every signed-in user (`/api/getSites`, `/api/getCategories`); only the write endpoints and the admin listing (`/api/getManagedCategories`) are `withAdmin`.

### Entities and DTOs

Entities (in each module's `models/` folder) are neorm Active Record classes. Besides `@Column`, they declare their **relationships** with `@HasOne`, `@HasMany`, `@HasManyThrough`, `@BelongsTo` (e.g. `Tournament` has many `categories` and, through them, `competitors` and `matches`, and belongs to its `owner` User). Relations can be eager-loaded with `Entity.with('relation')`.

FE DTOs live alongside the entities in the same `models/` folder and are typically **derived from the entities** with the neorm `Dto<T>` type instead of being written by hand:

```ts
export type CompetitorDto = Dto<Competitor>            // columns + getters + loaded relations
export type UserDto = Omit<Dto<User>, 'passwordHash'>  // derived, minus sensitive fields
```

To produce a DTO from an instance use `entity.toDto()`. Adding a column to an entity automatically updates its DTO.

### API endpoints

All endpoints (except Auth.js own `/api/auth/[...nextauth]`) follow the same contract:

- **Method**: always `POST`, with a JSON body for the parameters — except the Mercado Pago webhook and the `processTournaments` Vercel Cron endpoint, which are plain `GET`/`POST` handlers outside this contract (see "Service fee settlement" and "Domain notes").
- **Route naming**: a single verb+noun segment under `/api/`, e.g. `/api/createTournament`, `/api/getTournaments`, `/api/joinTournament`, `/api/registerUser`, `/api/updateAccount`.
- **Response**: always the standard `ApiResponse` shape (`app/models/ApiResponse.ts`):

```ts
{ success: true, data: ... }                          // success
{ success: false, error: { name, message } }          // error (message is shown to the user as-is)
```

Handlers are wrapped with `withApi` (public), `withAuth` (requires session) or `withAdmin` (requires an administrator session), all from `app/utils/api-server.ts`. They resolve the current `organizationId` from the request's `Host` header and inject it into the handler; `withAuth`/`withAdmin` also resolve and inject the signed-in `userId` (401 if there is none, 403 if `withAdmin` gets a non-administrator). Whatever the handler **returns** is sent as `data`, and errors are signalled by **throwing** `ApiException(message, status)` — unexpected (non-`ApiException`) errors are logged server-side and masked as `"internalError"` in the response.

```ts
export const POST = withAuth(async (request, context, userId, organizationId) => {
  const input = (await request.json()) as CreateTournamentInput

  return createTournament(input, userId, organizationId) // -> { success: true, data: ... }
})
```

On the client, `executeRequest<T>(url, payload)` — returned by the `useRequests()` hook (`app/hooks/useRequests.ts`) — posts to `/api${url}` and returns `data` cast to `T`, or **throws** an `Error` whose `message` is the server's error message and shows it via a toast (`react-hot-toast`, `useNotifications`). Module hooks (e.g. `useTournaments`, `useAccount`) call `executeRequest` directly — there is no separate FE "actions" layer.

### Conventions — where do I put new code?

- **A new page** → `app/(module)/(pages)/<route>/page.tsx`. When organizers and players see different things, the page checks `session.user.roleId` (server) and renders the proper view; client components read the role from the user store.
- **A new API endpoint** → `app/(module)/(api)/api/<verbNoun>/route.ts`, exporting `POST` wrapped with `withApi`/`withAuth`.
- **A component used only by one module** → `app/(module)/components/<Name>/index.tsx`. Used by several modules → `app/components/<Name>/index.tsx`.
- **An API call from the FE** → add it to the relevant module's `hooks/` (or shared `app/hooks/`), calling `useRequests()`'s `executeRequest`.
- **A neorm entity** → the `models/` folder of the module that owns the concept, with its relationships configured.
- **FE DTOs/types** → same `models/` folder as the entity; derive DTOs with `Dto<T>`. Cross-module models → `app/models/`.
- **BE logic** → `app/(module)/services/`.
- **A new feature module** → create `app/(my-feature)/` (inside `app/(protected)/` if it requires a session) with the folders you need and document it here. No registration needed anywhere.

Cross-module imports are allowed but should be the exception (e.g. the tournaments module imports `UserDto` from the shared `app/models/`). Shared code that several modules depend on belongs at the `app/` root instead.

Imports are always absolute via the `@/` alias (enforced by ESLint), e.g. `import { auth } from '@/app/(auth)/services/auth'`.

> **Note:** `proxy.ts` (route protection + subdomain resolution) must stay at the project root — Next.js requires it next to `app/`, it cannot live inside a module.

## Domain notes

- **Roles**: each user is an Administrator, an Organizer or a Player (`roleId`), assigned once — at registration, at `/select-role` on the first login, or by an administrator from `/users` — and not switchable by the user. Administrators don't take part in the competition: they only manage the organization's users.
- **Tournament types** (`TournamentType`): league (round robin), americano and americano with partner swapping per round, playoff (knockout bracket), playoff with consolation bracket, groups + playoff (round-robin groups feeding a knockout stage), and **interclubes** (see below).
- **Disciplines**: padel (always doubles) or tennis (singles or doubles via `subDiscipline`; interclubes is the exception — it is tennis-only and mixes both, so it stores no `subDiscipline`).
- **Catalogues**: the **sedes** (venues) and **categorías** a tournament uses are organization-wide catalogues maintained by the administrator; organizers only pick from them (see "Catalogues administration").
- **Score formats**: 3 sets, 2 sets + super tiebreak, or a basic counter. Walkovers (W.O.) are supported everywhere. Interclubes stores a richer payload in the same `matches.score` column (see below).
- The organizer starts the tournament, closes each round once all results are loaded and opens the next one; pairings are computed automatically based on the tournament type. `GET /api/processTournaments` (a Vercel Cron job, see `vercel.json`, secured by `CRON_SECRET`) auto-starts scheduled tournaments at the organization's local time.
- Players register from the tournament page (or via the shared WhatsApp link `/tournaments/:id/join`), choosing a platform user or a free-text name as partner in doubles disciplines. Interclubes registers whole teams instead (see below).
- Avatars come from Gravatar based on the account email.
- The app is installable as a **PWA** (Serwist service worker, offline fallback at `/~offline`, web manifest) — see `app/sw.ts` and `app/(public)/(pages)`.

## Interclubes tournaments

`TournamentType.INTERCLUBS` is **tennis-only**, the one type where competitors are **teams of a venue** rather than a player or a pair, and where the organizer configures no format at all: everything below is derived. It is also the only tennis format with no modality — an encounter mixes singles and doubles, so `subDiscipline` stays null (which is why the tournament form asks for the type *before* the modality, and hides the latter here). The rules live in `app/(protected)/(tournaments)/utils/interclubs.ts` (pure, shared by server and client) and are explained to organizers and players in a notice on the tournament page.

**Registration.** A team registers with a **sede** (`sites`) and **4 players minimum**. The person registering is the team captain and plays like anyone else. The venue is stored in the new `competitors.data` JSONB (`{ siteId }`) and the team is displayed through the new `competitors.label`: the venue name, or the venue name plus a letter when that venue enters more than one team in the same **tournament category** ("Alemán A", "Alemán B"). Labels are relative to each other, so `assignSiteLabels()` recomputes the whole category on every register / unregister / move — the first team goes back to a plain "Alemán" when its sibling leaves. `Competitor.displayName` / `shortName` return the label when set, so every list, bracket and table shows it without changes. Two teams of the same venue in *different* categories keep the same plain name.

**Format, derived from the number of teams** (`resolveInterclubsFormat`):

- **2 to 4 teams** → a single zone played **home and away** (everybody meets everybody twice). No knockout: the table decides the title.
- **more than 4** → zones of 4 plus a knockout. The zone count is `floor(teams / 4)` and the leftovers are spread over them, so zones *grow* instead of multiplying (11 teams → 2 zones of 6 and 5, not 3 of 4/4/3 — unlike groups+playoff, which targets a group size with a ceil division). Zones play a single round robin. The **top 2 of each zone** advance, except when everybody fits in a single zone, where the **top 4** do so there is still a semifinals + final to decide the title.

**Home advantage (localía).** Playing at home is not the same as playing away, so the round-robin circle method only decides *who* meets whom; who *hosts* is decided by `assignLocality`, for every match of the tournament including the knockout: (1) if the two clubs already met, the localía is inverted; (2) otherwise the club that has hosted fewer times hosts; (3) ties are broken by a hash of the matchup rather than `Math.random()`, because the engine deletes and rebuilds rounds when an earlier result is corrected and real randomness would silently swap the venue of unrelated matches.

**Series scores.** An encounter is always **3 individual matches** — one doubles + two singles, or two doubles + one single — and **a player may only play one of them** (hence the 4-player minimum, and 5 for the two-doubles line-up). They are stored in the existing JSONB `matches.score` as `{ home, away, matches: [...] }`, where `home`/`away` is the series result (3-0, 2-1, …) and each entry of `matches` carries its type, the players of each side, its own result in the tournament's score format and its winner. `isValidScore` enforces all of it when the tournament type is interclubes (rosters included), and the score dialog only offers players who are still free.

**Standings.** No configurable points: **Pts** = encounters won, then **DP** (difference of individual matches), then **DS** (difference of sets), then the head-to-head between the tied teams. `rankInterclubs` is shared by the standings table and the knockout seeding, so what the table shows and who advances can never disagree.

## Service fee settlement (Mercado Pago)

Tournaments can be **free** or have an **entry fee** (`tournaments.entryFee`, always ARS). The fee is chosen in the **Inscripciones** section when creating the tournament, or edited later while it is in `stand_by`.

**Nothing is charged through the platform at registration time.** A player joins in one click, free or not, and settles the entry fee directly with the organizer (cash at the venue, transfer, whatever they agree on) — the app does not model that transaction at all. What TeamUp charges is its **service fee** to the *organization*, after the fact:

- The fee is `organizations.serviceFeePercentage` (default **4%**, not editable by organizers — it is TeamUp's cut) applied to what each tournament collected: `competitors × entryFee × serviceFeePercentage`. It travels to the client in `SessionOrganization` (organization store), so the screens that state the fee — the tournament form, the Pagos page — read the organization's real value instead of hard-coding one. A competitor is an *inscription*: a doubles pair (or a whole interclubes team) counts once, since it pays a single entry fee.
- A tournament becomes billable **the moment it starts** (`ONGOING` or `FINISHED`), and is billed for **every** registered competitor. Both halves of that rule are what make the amount final: registrations close when a tournament leaves `STAND_BY`, so from that instant the roster — and therefore the bill — can no longer change. Billing only the competitors that had already played would break it from the other end: a 40-entry tournament paid after the first 5 matches would be charged for a handful of players and, being flagged as paid, never charged for the remaining 35.
- Free tournaments, and paid ones that have not started yet, are never billed.

**The Pagos page** (`/payments`, organizers and administrators — both see and can pay the whole organization's debt) lists every unsettled tournament with its billable competitors, what it collected and what it owes, plus the total. One button opens a single Mercado Pago checkout for all of them.

- `createServicePayment` writes a `service_payments` row (status `PENDING`) that **snapshots** the tournaments and amounts, then creates a Checkout Pro **preference** collected by TeamUp's own account (`MP_ACCESS_TOKEN`; a `TEST-…` token routes the payer to `sandbox_init_point`). The snapshot is belt and braces: the roster of a started tournament cannot move any more, but it also pins the amount against a tournament starting while the payer is on the checkout.
- Mercado Pago notifies `POST /api/processServicePaymentState?ref=<paymentId>` (a public endpoint outside the standard `ApiResponse` contract, with its own `x-signature` verification when `MP_WEBHOOK_SECRET` is set). On `approved` it marks every covered tournament `paid = true` (with `paidAt` / `servicePaymentId`) inside a transaction. The webhook is idempotent.
- **`tournaments.paid` means "the service fee was settled"**, not "this tournament has a cost" — that is `entryFee > 0`. Migration 015 resemantized the column (it used to mean the latter) and reset every row.

**Overdue debt.** A tournament that started more than a month ago and is still unpaid is *overdue*. While the organization has at least one, the organizer and administrator homes show a reminder banner and **no new tournament can be created** — enforced in `createTournament` (the server is what decides), with the button disabled and `/tournaments/new` redirecting to `/payments` so the form is never rendered just to fail on submit.

Environment variables: `MP_ACCESS_TOKEN` and the optional `MP_WEBHOOK_SECRET` (see `.env.example`). There is no OAuth: organizers connect nothing. For local development the webhook needs a public URL reachable by Mercado Pago (e.g. an ngrok tunnel) and `NEXT_PUBLIC_APP_URL` set to it.

## Testing

Two independent test suites:

- `yarn test` (Vitest) — integration tests for the tournament engine (models/services) against an in-memory SQLite database, no HTTP layer. See `tests/README.md`.
- `yarn test:e2e` (Playwright) — real browser end-to-end tests of the app's main flows (auth, the organizer + player tournament lifecycle, account, payments) against a real running Next.js server and a dedicated, disposable SQLite database. See `tests/e2e/README.md`.
