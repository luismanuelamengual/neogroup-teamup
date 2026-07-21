# TeamUp — Tournament engine: findings & fixes

The bug-hunting pass over the tournament engine surfaced four defects. **All four
are now fixed**, and each one is guarded by a regression test in `tests/bugs/`
(`yarn test:regression`). This document records what was wrong and what changed.

```bash
yarn test              # everything — all green
yarn test:flows        # full start→finish flows for the 6 tournament types
yarn test:edge         # edge / border / unit suites
yarn test:regression   # the four regression tests below
```

> Tests run against an in-memory SQLite database; production is PostgreSQL.

---

## BUG #1 — Starting a seeded tournament duplicated every competitor (HIGH) ✅ fixed

**Root cause — in the `@neogroup/neorm` library.**
`autoAssignPreclassification()` persists the seeds with a single batch upsert
keyed on the primary key:

```ts
await Competitor.upsert(updates, 'id', ['seedNumber'])
```

That is the right, performant call — but neorm's `EntityRepository._toStorageRow`
(shared by `insert()` and `upsert()`) stripped **every auto-generated column**,
including the PK `id`. So the emitted statement was `INSERT INTO competitors
(… no id …) … ON CONFLICT (id) DO UPDATE …`: the conflict target `id` was never
written, `ON CONFLICT (id)` could never match, and **a new row was inserted
instead of updating** — duplicating every competitor on start (an 8-player
bracket became 16 phantom entries). This hit **PLAYOFF, GROUPS_PLAYOFF and
PLAYOFF_WITH_CONSOLATION**; the same SQL is generated for PostgreSQL, so it
reproduced in production too, and it also defeated the `notEnoughCompetitors`
guard (a 1-competitor field became 2).

**Fixed in neorm** (`src/entities/EntityRepository.ts`): `_toStorageRow` now takes
a `keepProps` list, and `upsert()` passes the conflict-target columns so they are
written into the INSERT even when auto-generated. `insert()` is unchanged. The
emitted SQL is now a single batch statement that updates in place:

```sql
INSERT INTO competitors (id, tournamentCategoryId, …) VALUES (…), (…), …
ON CONFLICT (id) DO UPDATE SET seedNumber = EXCLUDED.seedNumber;
```

The app keeps the efficient one-statement `Competitor.upsert(...)`. neorm's own
suite covers it (`test/upsert.test.ts`: "upsert keyed on the auto-generated
primary key updates in place").

> ⚠️ This fix lives in the neorm package. The dev sandbox patched
> `node_modules/@neogroup/neorm` directly so it works now; for a clean release,
> rebuild and publish neorm (its `dist` is already rebuilt) and reinstall in the
> app — otherwise a fresh `yarn install` of 0.0.35 would reintroduce the bug.

**Guard:** `tests/bugs/known-bugs.test.ts → REGRESSION #1` (app side) and
`test/upsert.test.ts` (library side).

---

## BUG #2 — Americano forced avoidable rematches (MEDIUM) ✅ fixed

**Where:** `app/(protected)/(tournaments)/utils/tournaments.ts` →
americano round generation.

**Was:** from round 2 on, a fixed-partner americano paired competitors greedily by
standings. Greedy per-round matching can strand pairs: with 6 players over 5
rounds it replayed `3-4` and `5-6` and **never played `3-6` or `4-5`** (13 of 15
pairs), even though a perfect round-robin existed.

**Now:** a fixed-partner americano that plays its **complete** schedule is built
with the **circle method** — a proper round-robin: every pair meets exactly once
and the bye rotates fairly. Standings-based pairing (winners vs winners) is kept
only for a `maxRounds`-**truncated** americano, where competitors will not face
everyone anyway; that path now also (a) avoids rematches via a backtracking
rematch-free matching and (b) rotates the bye fairly (see BUG #3). The decision is
`isFullAmericanoRoundRobin()`.

**Guard:** `tests/bugs/known-bugs.test.ts → REGRESSION #2`.

---

## BUG #3 — Odd-field americano benched the weakest player repeatedly (MEDIUM) ✅ fixed

**Where:** same americano pairing.

**Was:** with an odd field one player sits out each round, but the pairing always
consumed the highest-ranked players first, so the **lowest-ranked** player was the
leftover — round after round. With 5 players the matches-played counts came out
`5, 5, 5, 3, 2` (someone played every round, someone sat out 3 of 5).

**Now:** the bye goes to the competitor who has **played the most matches so far**
(i.e. has had the fewest byes), ties broken by the lowest standing — so the bye
rotates. With the full-schedule circle method this is automatic; the truncated
path uses the same fair-bye rule. Five players now each play four matches.

**Guard:** `tests/bugs/known-bugs.test.ts → REGRESSION #3`.

---

## BUG #4 — Single-group groups+playoff replayed the same pair (LOW) ✅ fixed

**Where:** the groups → knockout join (`maybeStartGroupsKnockout` /
`materializeCategoryRound`) and `utils/champion.ts`.

**Was:** when a GROUPS_PLAYOFF resolved to a **single group** (e.g. two
competitors, or `competitorsPerGroup ≥ field`), both qualified and met **again**
in a knockout final — a redundant rematch of a pairing the group had already
decided.

**Now:** with only one non-empty group the knockout is skipped (it could only
replay the group); the group standings decide the result, and
`getPodiumCompetitorIds()` falls back to those standings for the
champion/podium. Multi-group tournaments (including the `[2, 1]` degenerate split)
still build the knockout and cross-seed as before.

**Guard:** `tests/bugs/known-bugs.test.ts → REGRESSION #4`.

---

## Observations (intended behavior, documented — not bugs)

- **O1 — Swap americano needs ≥4 individuals.** `AMERICANO_WITH_SWAP` cannot form
  a 2-v-2 match with 2 or 3 individuals and reports `noMatchesGenerated` at start.
  Asserted in `tests/edge/boundaries.test.ts`. (Left as-is; consider validating
  the minimum field of four when the tournament is created for a clearer message.)
- **O2 — Walkovers count as "played" for the absent side** in league standings,
  while `pointsPerPresent` is only awarded to the side that showed up. Asserted in
  `tests/edge/walkovers.test.ts`.
- **O3 — LEAGUE ignores `maxRounds`** (only the americano variants read it).

---

## What the suites cover

- **`tests/flows/`** — full start→finish flows for all six types across many
  configurations: field sizes (incl. odd / non-power-of-two), score formats,
  custom point settings, `maxRounds`, multiple categories, group sizing /
  qualifier counts, consolation seeding. Invariants: round counts, no
  double-booking, complete round-robins, bye handling, winner propagation,
  group→knockout timing, completion + champion/podium.
- **`tests/edge/`** — minimum fields, degenerate groups, walkover-driven events,
  grace-window result edits + downstream rebuilds, locking of past rounds,
  standings math.
- **`tests/unit/`** — pure score validation/serialization and bracket/seeding math.
- **`tests/bugs/`** — the four regression tests above.
