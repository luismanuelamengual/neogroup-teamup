# NeoGroup TeamUp

Web application to create and play tennis & padel tournaments and leagues.

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **MUI** for UI components, **SASS** for styling
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
  page.tsx               Entry point: redirects to the right home per session
  globals.scss           Global styles
  components/            Shared components used by any module (AppShell, AppLayout, ...)
  actions/               Shared FE actions (executeRequest, the REST client helper)
  models/                Shared FE models (ApiResponse, the standard API response shape)
  stores/                Shared zustand stores (e.g. notifications)
  utils/                 Shared utilities (gravatar, api-server helpers, lang.ts — i18n config)
  lang/                  Texts shared by the whole app (common, nav)
  (auth)/                Authentication module (login, register, role selection, user store)
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
  components/      React components of this module (see "Components" below)
  actions/         FE actions: thin client-side wrappers around the REST API (e.g. getTournaments)
  entities/        BE entities of @neogroup/neorm (one class per database table, with relationships)
  models/          FE models: DTOs, domain types and request payloads shared between actions and API handlers
  stores/          zustand stores scoped to this module
  hooks/           React hooks scoped to this module
  utils/           Pure utilities scoped to this module
  services/        BE services: server-side data manipulation (queries, business logic helpers)
  lang/            Texts of this module (es.json, en.json) — see "Internationalization"
  (pages)/         All the pages of this module (route group: it does not affect the URL)
  (api)/           All the API endpoints of this module, under (api)/api/... (URLs keep the /api prefix)
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

### Users and roles

A user has a **`roleId`** assigned once — `1` = Organizer, `2` = Player (constants in `UserRoles`, `app/(auth)/models/user.ts`) — and **it cannot be switched**. The role is chosen in the registration form; users signing in without a role (e.g. first Google login) pick it once at `/select-role`.

The signed-in user (including its `roleId`) lives in a **zustand store**: `useUserStore` in `app/(auth)/stores/users.ts`, hydrated by `AppLayout` through `UserStoreHydrator`. Any client component that needs to take a decision based on the role reads it from this store (see also the `useUserRole` / `useIsOrganizer` helpers). Server components and API handlers read the role from the session (`session.user.roleId`).

Pages are shared between roles: the same `/tournaments` routes render the organizer or the player experience based on the role.

### Entities and DTOs

Entities (in `entities/`) are neorm Active Record classes. Besides `@Column`, they declare their **relationships** with `@HasOne`, `@HasMany`, `@BelongsTo` (e.g. `Tournament` has many `competitors`, `rounds` and `matches`, and belongs to its `owner` User). Relations can be eager-loaded with `Entity.with('relation')`.

FE DTOs are **derived from the entities** with the neorm `Dto<T>` type instead of being written by hand:

```ts
export type CompetitorDto = Dto<Competitor>            // columns + getters + loaded relations
export type UserDto = Omit<Dto<User>, 'passwordHash'>  // derived, minus sensitive fields
```

To produce a DTO from an instance use `entity.toDto()`. Adding a column to an entity automatically updates its DTO.

### API endpoints

All endpoints (except Auth.js own `/api/auth/[...nextauth]`) follow the same contract:

- **Method**: always `POST`, with a JSON body for the parameters.
- **Route naming**: the path ends with the action, e.g. `/api/tournaments/list`, `/api/tournaments/create`, `/api/tournaments/[id]/get`, `/api/tournaments/[id]/update`, `/api/users/register`, `/api/registrations/join`.
- **Response**: always the standard `ApiResponse` shape (`app/models/api.ts`):

```ts
{ success: true, data: ... }                          // success
{ success: false, errorMessage: '...', error: ... }   // error (errorMessage is a stable code the FE translates)
```

Handlers are wrapped with `withApi` (public) or `withAuth` (requires session) from `app/utils/api-server.ts`: whatever the handler **returns** is sent as `data`, and errors are signalled by **throwing** `ApiException(errorMessage, status)`.

```ts
export const POST = withAuth(async (request, context, userId) => {
  const input = (await request.json()) as SomeInput

  if (!input.valid) {
    throw new ApiException('missingFields')
  }

  return someData // -> { success: true, data: someData }
})
```

On the client, `executeRequest<T>(url, payload)` (`app/actions/api.ts`) posts to the endpoint and returns `data` cast to `T`, or **throws** an `Error` whose `message` is the `errorMessage` code. Actions are thin wrappers around it; components catch the error and translate the code (`t(\`errors.${error.message}\`)`).

### Conventions — where do I put new code?

- **A new page** → `app/(module)/(pages)/<route>/page.tsx`. When organizers and players see different things, the page checks `session.user.roleId` (server) and renders the proper view; client components read the role from the user store.
- **A new API endpoint** → `app/(module)/(api)/api/<resource>/<action>/route.ts`, exporting `POST` wrapped with `withApi`/`withAuth`.
- **A component used only by one module** → `app/(module)/components/<Name>/index.tsx`. Used by several modules → `app/components/<Name>/index.tsx`.
- **A FE action** → `app/(module)/actions/`. Generic helpers → `app/actions/`.
- **A neorm entity** → `entities/` of the module that owns the concept, with its relationships configured.
- **FE models** (DTOs, types, payloads) → `models/` of the module; derive DTOs with `Dto<T>`. Cross-module models → `app/models/`.
- **BE logic** → `app/(module)/services/`.
- **Texts** → the module's `lang/es.json` and `lang/en.json` (picked up automatically — see below).
- **A new feature module** → create `app/(my-feature)/` with the folders you need and document it here. No registration needed anywhere.

Cross-module imports are allowed but should be the exception (e.g. the tournaments module imports `UserDto` from the auth module, which owns the user concept). Shared code that several modules depend on belongs at the `app/` root instead.

Imports are always absolute via the `@/` alias (enforced by ESLint), e.g. `import { auth } from '@/app/(auth)/services/auth'`.

> **Note:** `proxy.ts` (route protection) must stay at the project root — Next.js requires it next to `app/`, it cannot live inside a module.

### Internationalization (distributed `lang/` folders)

There is no central message catalog. Every module owns its texts inside its own `lang/` folder, so everything related to a feature — including its texts — is encapsulated in the module:

```
app/lang/es.json                  Shared namespaces: common, nav
app/(auth)/lang/es.json           Namespaces: auth, roleSelect
app/(account)/lang/es.json        Namespace: account
app/(tournaments)/lang/es.json    Namespaces: tournaments, organizer, player, score
```

The next-intl request config lives at `app/utils/lang.ts` and discovers the catalogs **dynamically**: it merges every `app/*/lang/<locale>.json` file (plus `app/lang/<locale>.json`) at runtime, so a new module with a `lang/` folder needs **no registration** anywhere.

Rules:

- Each module file declares its **own top-level namespaces** (never reuse a namespace owned by another module). Components consume them as usual with `useTranslations('namespace')` / `getTranslations('namespace')`.
- Both locales (`es.json` and `en.json`) must define the same keys.
- Catalogs are read with `fs` from the `app/` directory, so a `standalone` build would need the lang files copied next to the server output.

## Domain notes

- **Roles**: each user is an Organizer or a Player (`roleId`), assigned once at registration (or at `/select-role` on the first login) and not switchable.
- **Tournament types**: league (round robin), americano (padel only, optional partner swapping per round) and playoff (knockout bracket with byes).
- **Score formats**: 3 sets, 2 sets + super tiebreak, or a basic counter. Walkovers (W.O.) are supported everywhere.
- The organizer starts the tournament, closes each round once all results are loaded and opens the next one; pairings are computed automatically based on the tournament type.
- Players register from the tournament page (or via the shared WhatsApp link `/tournaments/:id/join`), choosing a platform user or a free-text name as partner in doubles disciplines.
- Avatars come from Gravatar based on the account email.
