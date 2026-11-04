# D1 database compatibility fix — prepared Nov 3, 2026

## Result

The code now supports the existing `suredose-test` Cloudflare D1 binding (`DB`).
No PostgreSQL account or live data conversion is required for this code path.
PostgreSQL remains available when explicitly configured; ordinary Node development
retains PGlite. The local Wrangler configuration targets the user-confirmed test
Worker and the D1 identifier read from its deployed binding metadata.

**This is a locally verified implementation, not a completed live upgrade.** No
commit, push, remote migration, deployment, provider change or secret write ran.

## Implementation

- `src/lib/d1.ts`: bound SQL parameters, the app's limited common SQL subset,
  array/JSON/date/boolean conversion, and per-invocation DB binding selection.
  This is not a general PostgreSQL-to-SQLite translator: unsupported casts fail.
- `src/lib/db.ts`: explicit PostgreSQL first, otherwise request-bound D1; PGlite
  is restricted to Node development. A Worker missing both databases fails
  explicitly rather than attempting unsupported embedded WASM initialization.
- Better Auth uses its installed native D1 adapter. Auth-disabled durable database
  requests cannot fall back to a shared development user. Existing session,
  origin, CSRF and user-scoping rules remain intact.
- D1's photo limiter uses a single atomic SQLite UPSERT. Missed-dose scheduling
  expands IANA local times in JavaScript with the same repeated-hour/spring-gap
  choices tested against PostgreSQL; database leases and atomic conflict guards
  preserve concurrent-send protection and retry behavior.
- D1 SQLite schema lives in `migrations/d1`; root PostgreSQL migrations remain
  unchanged. The additive timezone/lease upgrade is separate from the fresh
  baseline. New schedule starts are filled by a SQLite trigger; no automatic
  live migration occurs during build or requests.
- CI now has PostgreSQL and D1 browser matrix entries. This uncommitted workflow
  has not run on GitHub yet. Local tests cover real SQLite SQL execution, native
  Better Auth persistence, rate limits, timezone transitions and notification leases.

## Local verification

- `npm run db:migrate:d1:local`: applied both migrations only to isolated local D1.
- `npm run db:check:d1 -- --local`: schema columns/types passed.
- 352 tests passed (197 script + 155 application), including 5 new D1 tests.
- Typecheck and Cloudflare production build passed.
- Dev/built desktop and mobile render checks passed; images inspected; clean
  console, no overflow, no baseline differences or share-card warnings.
- Built Worker using real local D1 passed all 13 pill-flow browser checks without
  PostgreSQL bindings. Actual server-side replay rejection exercised D1 rate limits.
  A synthetic patient also created a household through the built app successfully;
  its family code was not printed. No remote household or real push/AI call occurred.

## Live upgrade gate

D1 read access verified Nov 3. The bound ID is named **suredose** (Worker stays
`suredose-test`); Wrangler's database label now matches. Schema and migration
bookkeeping queries succeeded with `rows_written: 0` / `changed_db: false`.
No patient rows were queried. D1 write access remains untested.

Remote history is `0001_init.sql` (Oct 24 18:02:53 UTC) and
`0002_household_timezone.sql` (Oct 24 20:13:31 UTC), not the new local history.
Seven application tables exist, plus `d1_migrations`; existing indexes and table
constraints were inspected. Existing `households.timezone` must be preserved.
The remote preflight fails for missing auth/caregiver/rate-limit tables and four
schedule/notification columns; no existing column type mismatch was reported.

Prepared **`migrations/d1-reviewed-upgrades/0003_current_app_support.sql`** outside
the automatic migration directory. It creates seven missing tables and their
indexes, adds `care_medicines.timezone` / `schedule_started_at` and
`dose_events.notification_claim` / `notification_claim_until`, initializes schedule
start timestamps, and adds the insert trigger. It does not delete tables or rows,
replace identifiers, infer medicine timezones, or alter household timezone values.
It is single-application SQL; do not rerun after success or partial application.
Legacy schedules remain excluded from alerts until the patient syncs timezone.
Synthetic old-schema rehearsal passed: expected columns, preserved rows/timezone,
start-time backfill/trigger and foreign-key check. Timestamp default precision in
existing live tables differs from the fresh baseline and is preserved.

Release procedure (requires explicit approval):

- Recheck exact schema/history immediately before applying. Pause app writes during
  the upgrade and validation window. Capture a fresh recovery bookmark with
  `wrangler d1 time-travel info suredose --config wrangler.jsonc`; stop if unavailable.
  See [Cloudflare Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
  No backup export or restore has been performed here.
- Apply only the reviewed SQL file to this database. Verify remote preflight,
  indexes/constraints and trigger; record `0003_current_app_support.sql` in existing
  migration bookkeeping only after successful validation. Do not use the default
  local migration folder against this older remote history.
- Keep the previous Worker version available. If validation fails, stop the release.
  A Time Travel restore overwrites later writes and requires separate explicit
  approval; coordinate the recovery window before resuming traffic.
- Deployment remains a separate approved action, with auth/VAPID/configuration,
  current CI and real-phone gates below still outstanding.

Before any remote apply:

1. Schema-read access is confirmed. Keep credentials out of source, Issues and chat.
2. Run the read-only remote preflight and inspect the existing D1 schema,
   constraints, indexes and migration bookkeeping. It queries metadata only,
   never patient rows. Verify the actual database name associated with the known ID.
3. Review a database backup/restore plan and an additive upgrade matched to that
   schema. Do NOT blindly apply `0001_initial.sql` to an existing database or
   assume its migration history matches the new local files. Preserve existing
   rows, identifiers, households and references. No data is dropped by this code.
4. Obtain explicit approval for the concrete migration and test-Worker release.
   Live writes also require the appropriate D1 write permission.
5. Apply only the approved schema upgrade, deploy the approved commit to
   `suredose-test`, and verify the database binding and model configuration.
   A stable BETTER_AUTH_SECRET and the intended BETTER_AUTH_URL must also be
   verified before relying on durable caregiver sign-in; neither secret was
   changed here. Check the build-time VAPID public key separately.
6. Reopen the patient app to sync timezone, then run `PHONE_TEST_RESULTS.md`.
   Do not merge/tag before the real-phone checklist passes; Issue first on failure.

A successful local schema check is not proof that the remote schema is compatible,
that Google recognizes real pills accurately, or that phone push delivery works.
