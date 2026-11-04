# SUREDOSE MEMORY — READ THIS FIRST

## Paused at user request — Nov 3, 2026

- User requested stopping here and recording the current state. Do not resume
  live migration or deployment work without a new user instruction.
- D1 read access is confirmed; the live schema remains unchanged and incomplete
  for the prepared current app. See the immediately following section for findings.
- The additive SQL and release/recovery report are prepared, locally rehearsed,
  and remain uncommitted. The request to approve applying the upgrade was NOT
  approved; this pause is not migration or deployment authorization.
- No live migration, deployment, secret/provider change, commit or push occurred.
  Existing uncommitted work is preserved. Latest checks: typecheck and 352 tests
  passed; diff whitespace check passed. This pause only edits this memory file.
- Resume by reading this file and D1_DATABASE_FIX.md, checking git state, and
  reviewing migrations/d1-reviewed-upgrades/0003_current_app_support.sql. Before
  any explicitly approved live apply, recheck schema/history and capture a fresh
  recovery bookmark with a coordinated maintenance window. Deployment is separate;
  retain the real-phone STOP RULE and no-merge/no-tag gate.

## D1 access follow-up — Nov 3, 2026 (READ ACCESS CONFIRMED)

- Read this section before the historical access blocker below. Existing credential
  now lists D1 and executes schema-only queries successfully. No credential changed.
- Exact bound database ID remains f0ff8234-58ff-420f-9ffa-b5363ed713ad; confirmed
  database name is `suredose`. Updated database_name label only; Worker remains
  `suredose-test`. Other database listings are irrelevant to this project.
- Remote preflight FAILS for missing schema, not permission. Existing seven app
  tables plus d1_migrations inspected with indexes/constraints; no patient rows read.
  Migration history: 0001_init.sql, 0002_household_timezone.sql, both Oct 24.
  Existing households.timezone is extra and must be retained. No type mismatch.
- Prepared migrations/d1-reviewed-upgrades/0003_current_app_support.sql outside
  automatic migrations_dir: seven missing tables, indexes, four columns, schedule
  start backfill/trigger. Synthetic old-schema rehearsal PASS preserving rows and
  household timezone. No live SQL writes ran; metadata reports zero rows written.
- D1_DATABASE_FIX.md now has exact findings, reviewable SQL and recovery/release
  procedure. Capture fresh Time Travel bookmark before any approved live upgrade;
  restore is destructive and separately approved. Write permission is untested.
- Typecheck PASS; 352 tests PASS (197 script + 155 application). No product UI
  changes; prior visual/build evidence remains historical, not rerun here.
- No commit/push/migration/deploy/secret/provider change. Live upgrade and release
  require explicit approval under existing project rules. Preserve all dirty work
  and real-phone STOP RULE. Next: approve/review prepared additive migration;
  recheck schema, establish recovery bookmark and maintenance window before apply.

## D1 compatibility implementation — Nov 3, 2026 (LOCAL PASS; LIVE BLOCKED)

User requested fixing the DB conflict. The selected implementation keeps the
existing D1 database and adds native D1 support; it does not replace the database
or move data to a new service. This supersedes the code-level incompatibility
below, but the live schema/release gate remains unresolved.

- Code: `src/lib/d1.ts` supplies parameterized common-query compatibility and
  JSON/boolean/date handling. `getSql` resolves D1 DB per invocation when no
  explicit DATABASE_URL exists. PostgreSQL and Node-only PGlite remain supported.
  Workers with no durable DB fail explicitly rather than starting PGlite.
- Better Auth uses its installed native D1 adapter; durable databases cannot use
  the auth-disabled shared dev-user fallback. No origin/session policy was relaxed.
- D1 photo-rate limiting uses one atomic SQLite UPSERT. Missed-dose expansion uses
  IANA timezone arithmetic in JavaScript with PostgreSQL-compatible DST choices;
  existing atomic notification leases/retry/status protections remain active.
- `wrangler.jsonc` now targets `suredose-test` (not the unrelated `suredose`) and
  binds DB to the database ID read from the existing Worker's metadata:
  `f0ff8234-58ff-420f-9ffa-b5363ed713ad`. The configured database_name label is
  `suredose-test`; its actual service-side name remains to be verified once D1
  metadata permissions are available. R2 binding is retained.
- Added SQLite files `migrations/d1/0001_initial.sql` and
  `0002_dose_alert_delivery.sql`, separate from unchanged root PostgreSQL files.
  The baseline and additive timezone/lease upgrade have been applied ONLY to
  Wrangler's local isolated D1. Do not blindly apply them to an existing remote
  schema or assume migration names/history align. No request/build auto-migrates
  live D1. A tailored additive live upgrade requires inspection and approval.
- `npm run db:migrate:d1:local` and `npm run db:check:d1 -- --local`: PASS.
  The schema-only preflight never reads application rows or changes schema.
- Final gates: 352 tests PASS (197 script + 155 application, including 5 new D1
  integration tests), typecheck PASS, production build PASS, diff check PASS.
  New tests execute real SQLite SQL and native Better Auth sign-up/session lookup;
  they cover parameter binding, arrays/JSON, limits/refill/concurrency, midnight,
  DST, notification retry/lease and taken-row protections.
- Dev/built desktop and mobile render: PASS, clean console and no overflow;
  screenshots visually inspected. Final built verdict `screenshots/suredose-d1-built.json`
  has `divergesFromBaseline: false`. All 13 built pill-flow browser checks PASS
  using actual LOCAL workerd D1, no PostgreSQL binding or live credentials.
  Real replay rejection exercised the D1 server path. Synthetic household
  creation through the built UI also succeeded; no family code was printed.
- CI workflow now has PostgreSQL/D1 browser matrix entries and captures both
  screenshot directories. These uncommitted changes have NOT run on GitHub;
  earlier green GitHub run 27 covers HEAD 03af87f, not this D1 implementation.
- LIVE BLOCKER: Cloudflare D1 list returned authentication error 10000. The
  read-only `npm run db:check:d1 -- --remote` also failed. Current token can
  inspect Workers but lacks the required access/scope for this D1 database.
  Cloudflare's query API accepts D1 Read or D1 Write. Next step is scoped D1
  Read access, then schema/index/constraint/migration-history inspection and a
  concrete data-preserving upgrade report before approval for live writes/deploy.
- `D1_DATABASE_FIX.md` contains the reviewable implementation and release gates;
  readiness/phone documents and README reflect the prepared D1 path. A stable
  BETTER_AUTH_SECRET/intended BETTER_AUTH_URL and VAPID public build key remain
  release checks; no secrets/provider/model settings were changed here.
- No live database reads of patient rows, live migrations, deployments, commits,
  pushes, merges or tags were made. Existing D1 data is untouched. Real Google
  recognition and real-phone delivery remain unverified. Preserve all prior
  uncommitted work and keep the real-phone STOP RULE.

## Historical confirmed test target and database mismatch — Nov 3, 2026

This section supersedes earlier target assumptions and the missing-Google-secret
claim for the user's test site. Do not use the separate `suredose` Worker as the
phone-test target.

- User-confirmed development/test URL:
  `https://suredose-test.sanlorenzoprx.workers.dev/`.
  Correct Worker name: `suredose-test`.
- User-confirmed source repository: `https://github.com/sanlorenzoprx/suredose`.
  GitHub hosts source and migration definitions; it is not the running database.
- Read-only inspection of `suredose-test`: latest listed deployment
  `dfaf3206-e0e7-4a49-b65f-b93294835954`, created Nov 2 at 15:58:57 UTC,
  routes 100% to version `2648c6bc-ecee-4ad9-8e42-a7e5a9bf69b6`
  (created `2026-11-02T15:58:56.642742Z`). Git commit provenance is unverified.
- Version binding names/types: ASSETS (assets), DB (Cloudflare D1),
  GOOGLE_SERVICE_ACCOUNT_JSON (secret), OPENFDA_API_KEY (secret), PILL_IMAGES
  (R2), VAPID_PRIVATE_KEY (secret), VAPID_SUBJECT (secret). Secret-list names
  independently confirm those four secrets. No secret values or database
  connection strings were printed. The earlier empty list was for `suredose`,
  which is a DIFFERENT Worker; it does not describe this test site's credentials.
- No DATABASE_URL binding was listed on `suredose-test`. Current branch's
  `src/lib/db.ts` uses PostgreSQL via DATABASE_URL, otherwise embedded PGLite;
  it does not consume the D1 DB binding. Therefore current repository code and
  the inspected test site's database configuration are not deployment-compatible
  as-is. D1 contents/schema were NOT queried, copied or modified. Do not run
  PostgreSQL migrations against D1, replace DB bindings, or deploy over this
  Worker without an explicitly authorized database/release plan.
- No VISION_PROVIDER, VERTEX_MODEL or Google location override was listed in
  the version's bindings. Actual deployed source/model/default behavior and the
  build-time VAPID public key are still unverified. Presence of secrets is not
  proof of a successful Google model call or push delivery. No paid AI request,
  real-phone test, live schema query, migration, deployment or secret write ran.
- Corrected `PRE_LIVE_TEST_CHECKLIST.md` and `PHONE_TEST_RESULTS.md` to use the
  user-confirmed URL, distinguish the unrelated Worker inspection, and retain
  the D1/PostgreSQL compatibility gate. All phone outcomes remain NOT RUN.
- Required gates rerun for this documentation task: 347 tests PASS (197 script
  and 150 application), zero failures; typecheck PASS; diff check PASS. No app
  code, dependency or build configuration changed in this task.
- Next: reconcile which source/version is deployed on `suredose-test` and decide
  how to align its D1 configuration with the reviewed PostgreSQL code before a
  release. Preserve the user's existing D1 data; no migration choice is authorized.

## Historical pre-live readiness review — Nov 3, 2026

- Verified remote branch directly through connected GitHub: `pre-hackathon-fixes`
  still resolves to `03af87fddf6bc71e741cf3421678a599b45e2fd4`, matching local HEAD.
  PR #1 remains open. GitHub Verify run 27 / run `41604012614` is successful:
  test, typecheck, build and browser jobs, including both dev and built-Worker
  pill-flow steps. This does not cover the still-uncommitted verification edits.
- Reviewed the full current diff; no actionable runtime regression found. Prepared
  a commit scope/title in `PRE_LIVE_TEST_CHECKLIST.md`, but did not stage, commit,
  push, merge, tag or deploy. Runtime logs/PIDs and old failure captures are not
  release assets. Existing uncommitted work and evidence remain preserved.
- Cloudflare READ-ONLY checks now work with the existing API token; no login or
  device-code approval was performed. Explicit target: Worker `suredose` in the
  authenticated account. Latest listed deployment
  `b6429773-3552-493a-8602-08e7b48e5fb2` (Nov 2, 18:09:11 UTC) routes 100% to
  version `97028616-1dbe-47bb-bd9c-748110c34913`. No Git commit is identified by
  its deployment annotations, so reviewed HEAD is not proven deployed.
- IMPORTANT BLOCKER: secret list for that Worker returned `[]`; version inspection
  lists only ASSETS and PILL_IMAGES bindings. No DATABASE_URL, Google credential,
  VAPID or auth secret binding was listed. This conflicts with older memory saying
  Google secrets were set. Confirm the actual phone URL/Worker/environment before
  changing anything. The inspected target is not ready for recognition/push testing.
  No secret values were printed, no credential was rotated, and no live database
  was accessed or migrated. Live schema/cron/model availability remain unverified.
- Replaced outdated blank `PHONE_TEST_RESULTS.md` with current release metadata,
  separate automated evidence, 12 NOT RUN real-phone checks, correct shared-IP
  photo limit timing (3-minute token refill), complete reference requirements and
  STOP RULE. Preserved the old b0d8391/294-test baseline as historical; its rows
  had no completed phone results. `PRE_LIVE_TEST_CHECKLIST.md` records exact CI
  evidence, the proposed diff scope, inspected deployment and unresolved gates.
- This pass reran the required gates: 347 tests PASS (197 script + 150
  application), zero failures; typecheck PASS; diff whitespace check PASS. Only
  documentation changed in this pass; the preceding production build remains
  the latest local build verification.
- Next: confirm which deployed HTTPS Worker the phones use, reconcile missing
  bindings on the intended target, and obtain explicit authorization for required
  configuration/migration/deployment changes before phone testing. Do not use
  green synthetic results as evidence that real Google recognition works.

## Completed local browser verification — Nov 3, 2026

This is the latest verification result and supersedes the browser-runtime blocker
below. Branch remains `pre-hackathon-fixes`, HEAD `03af87f`; nothing was committed,
pushed, merged, tagged or deployed. Existing uncommitted work was preserved.

- Restored Chromium using the installed Playwright CLI's official command:
  `node node_modules/playwright/cli.js install-deps chromium`, with execution
  permission. Required system libraries installed successfully in this Codespace.
  No app dependency or lockfile change was needed. For a replaced Codespace,
  rerun that installer if Chromium reports missing shared libraries.
- Downloaded `agent-browser` 0.41.1 into npm's tool cache via
  `npm exec --yes --package=agent-browser -- agent-browser`; it is not an app
  dependency. Interactive QA used an isolated browser and synthetic patient name.
  Patient onboarding, empty Home and Family navigation worked. Mobile Family
  screenshot inspected; page errors were empty. No household was paired and no
  real message, push, camera photo or AI request was sent.
- Development render: PASS at 1280x800 and 390x844, settled Welcome content,
  HTTP 200, no console/page errors, no horizontal overflow. Both screenshots
  visually inspected. Verdict: `screenshots/suredose-current-dev.json`.
- Fixed one additional verification-script path: `browser-smoke.mjs` now passes
  the script-derived project root to the share-card check. Without this it read
  nonexistent `/workspace` and falsely reported a missing card. The existing
  `public/og.jpg` and custom site metadata pass; no brand warnings remain.
- Development synthetic browser regression: PASS, all 13 checks in
  `scripts/suredose-ui-smoke.mjs`: no default dose time, missing-strength guard,
  schedule acknowledgement and invalidation on edits, removed saved-photo
  shortcut, real server replay rejection without recording a dose, camera stream
  capture, second-side retention, match/mismatch/blurry screens, clearing stale
  second-side state, checked-dose recording and duplicate-dose prevention.
- Production build rerun: PASS. Build-time `DATABASE_URL` was unset, so migrations
  were skipped by the build. `npm run typecheck`: PASS. `npm test`: PASS, 347 total
  (197 script + 150 application), zero failures. `git diff --check`: PASS.
- Production Worker render: PASS at both sizes, screenshots visually inspected,
  no console/page errors, overflow, brand warnings or baseline differences.
  Verdict: `screenshots/suredose-current-built.json`,
  `divergesFromBaseline: false`. This used the completed build after restarting
  the production preview; a prior run overlapping rebuild was discarded.
- Important configuration limit: the unconfigured Worker (no DATABASE_URL)
  renders, but its real photo-check call fails with `Invalid URL string` from
  PGLite bootstrap. This is NOT a passing database-free production configuration.
  CI already uses PostgreSQL. To verify that intended path here, started a
  disposable PostgreSQL 16 container on loopback port 55432, applied migrations
  0001–0008 ONLY to `suredose_test`, and supplied temporary local Worker bindings
  plus a generated test-only auth secret. Production synthetic browser regression
  then PASSED all 13 checks, including the real replay-rejection server boundary.
  No live database, provider or production secret was accessed or modified.
- Cleanup: stopped the QA production preview, removed the temporary `.dev.vars`
  bindings, and stopped/automatically removed the disposable database container.
  Development preview is left running through `startup.sh`. Screenshots and JSON
  evidence remain in `screenshots/`; temporary detailed logs are under `/tmp/`.
- These are browser fixtures and synthetic provider responses, not validation of
  real-model accuracy, Android camera behavior, real push delivery or deployed
  schema/configuration. `PHONE_TEST_RESULTS.md` remains incomplete for current
  HEAD. Next release gate: current-commit real-phone checklist and actual GitHub
  CI results; keep no-merge/no-tag and explicit deployment authorization rules.

## Browser verification follow-up — Nov 3, 2026

- Attempted the mandatory browser smoke check. The current Codespace is rooted at
  `/workspaces/suredose`, not `/workspace`; `/workspace` does not exist and creating
  an alias was denied even outside the restricted sandbox. Updated browser guard
  allowed roots to retain `/workspace` and include the script-derived project root;
  smoke and synthetic UI checks now support screenshots in this project's directory.
  Updated the existing guard-wiring assertions to match. Pass an explicit screenshot
  path under `/workspaces/suredose/screenshots` when invoking browser-smoke here.
- Browser launch is BLOCKED by missing host shared libraries: Chromium reports
  `libatk-1.0.so.0` missing. `ldd` also reports missing atk-bridge, Xcomposite,
  Xdamage, Xfixes, Xrandr, gbm, xkbcommon, asound and atspi libraries. Retrying with
  elevated execution did not resolve it. No new visual screenshot or interaction
  check passed; the failed-launch JSON is diagnostic evidence, not a render verdict.
  `agent-browser` is also unavailable in this environment.
- Production preview initially failed under sandbox network restrictions
  (`uv_interface_addresses`). With execution permission, `npm run preview:restart`
  succeeded and the built root returned HTTP 200. This confirms HTTP serving only,
  not hydration, usable UI, or absence of browser console errors. No production
  baseline comparison or synthetic pill-flow browser regression was completed.
- Development startup required execution permission to bind the listener. Added
  `setsid` to its existing `nohup npm run dev` command so its process session is
  detached when startup returns. `sh -n startup.sh`: PASS. `setsid` exists here.
  Startup stops the QA-only production preview as designed. The detached dev
  preview subsequently returned HTTP 200 and was left running.
- After the browser-script changes: `npm run typecheck` PASS; `npm test` PASS,
  347 total (197 script + 150 application), zero failures. Product source and
  build configuration were not changed by this follow-up; the preceding production
  build passed. All previous uncommitted work is preserved.
- Next gate: provide a browser runtime with its required system libraries, then
  rerun dev desktop/mobile screenshots and synthetic UI checks, inspect images,
  and compare the built output. Keep real-phone evidence and live deployment
  checks separate. No commit, push, merge, tag, deployment, migration, secret,
  or provider change was made.

## Verified workspace state — Nov 3, 2026

This section supersedes conflicting historical notes below. Checked in the current
Codespace; no GitHub remote refresh, CI status check, Cloudflare account inspection,
live deployment inspection, or real-phone test was performed in this task.

- Branch: `pre-hackathon-fixes`; HEAD `03af87f` (isolated preview bindings).
  HEAD matches the locally cached `origin/pre-hackathon-fixes` (0 ahead / 0 behind).
  This is not confirmation of the current remote branch or GitHub CI results.
- Existing uncommitted work was preserved: `src/lib/app-data/client.server.ts`
  (catch comment), `src/lib/vision-rate-limit.test.ts` (`let` to `const`), and
  `startup.sh` (resolve project directory from script location; use nohup).
  Review found no actionable bug in those three changes. This task additionally
  updates this memory file. No commit, push, merge, tag, or deployment was made.
- `npm test`: PASS — 347 tests (197 script + 150 application), zero failures,
  rerun during this audit with child-process permission.
- `npm run typecheck`: PASS. `npm run build`: PASS (Cloudflare Worker output).
  `DATABASE_URL` is NOT SET in this session, and the build reported
  `[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).`
  No live migration ran. Migration `0008_dose_alert_delivery.sql` exists; its
  application to the live database remains unverified.
- Four script test files initially failed inside the restricted sandbox:
  `brand-check.test.mjs`, `check-auth-invariant.test.mjs`,
  `with-app-env.test.mjs`, and `write-atomic.test.mjs`. A minimal child-process
  probe confirmed `spawnSync ... EPERM`, with empty stdout/stderr. The full suite
  passed when rerun with child-process permission; this was an environment
  restriction, not evidence of four application bugs. No code fix was needed.
- Current code already includes `src/lib/drug-verify.server.ts` (committed;
  latest path change `cc95d1d`), complete pill evidence/due-slot protections and
  timezone-aware retryable alerts (`8155aba`), and request-time auth initialization
  with isolated PostgreSQL preview verification (`f9bff60`). Section 6's old
  uncommitted-helper instructions are historical and must not be executed blindly.
- CI configuration includes test/typecheck/build jobs and a browser job using
  disposable PostgreSQL plus dev and Cloudflare built-output checks. Its latest
  change writes isolated Worker preview bindings into root `.dev.vars`. Actual
  GitHub check results were not queried.
- `PHONE_TEST_RESULTS.md` still names old commit `b0d8391`, lists 294 tests, and
  has blank results for all seven real-phone checklist rows. Historical reported
  phone passes below are not a completed current-commit checklist. Keep the
  no-merge/no-tag gate; any real-phone failure requires an Issue first.
- Browser checks were NOT rerun in this state-audit task. Existing screenshot
  verdicts are historical; one desktop verdict captured only “Loading your pills…”.
  Next: verify settled desktop/mobile UI and built-output flows, then collect
  current-commit real-phone evidence. Browser fixtures do not validate AI accuracy
  or actual push delivery.
- Source defaults to Google vision. No live provider, secret, deployment, or
  Cloudflare authentication setting was changed or verified. Keep live Google.
- No implementation of Jitsi/video check-in or caregiver reply flow was found in
  `src/` or `migrations/`; section 7 remains requested scope, not a shipped feature.
- Track remains unresolved (Startup previously selected versus historical Indie
  notes). Do not infer or change the submission track from older sections.

## Historical corrective pass — Nov 2, 2026
- User authorized fixing review issues 1–5 autonomously on GitHub. This connection has no Codespaces controls; changes are prepared in an isolated cloud checkout and published through GitHub.
- Pill comparison now rejects punctuation-only imprints and requires two readable reference/candidate sides, including blank reverses. Own-photo setup stores both sides; old one-sided references need setup again.
- Dose check validates today, a configured time, the due window and current taken state, including at confirmation. Practice remains non-recording.
- Care sync sends the patient IANA timezone. Migration 0008 adds timezone/start metadata and notification leases; apply it through the existing deployment migration process before deploying this code. No live migration was run in this pass. Legacy timezone=NULL schedules resume alerts after the patient app syncs.
- Missed-dose processing covers 48 hours across midnight, preserves taken/skipped rows, leases concurrent sends and retries failures. Push delivery is at-least-once with a stable notification tag, not proof that a person read the alert.
- No main merge, tag, live deployment, provider switch or secret changes are part of this pass. GitHub CI and real-device evidence remain separate gates.
- Prior sections below contain historical state; current GitHub refs/checks take precedence. Track remains to reconcile: user previously selected Startup, older notes below say Indie.

Last updated: Nov 3, 2026. Owner updates this after EVERY task.

## 1. What this project is
SureDose: PWA that prevents wrong-pill mistakes. Patient (Phone 1)
photographs pill bottle + pill; app reads drug name/strength and pill
imprint with AI vision, verifies against OpenFDA, shows GREEN CHECK
(right pill) or RED X (wrong pill). Caregiver (Phone 2) gets push
notifications for taken/missed doses.
Meta Global AI Hackathon: Oct 26 – Nov 4, 2026, submit by 9PM ET Nov 4.
Owner aims to submit by NOON Nov 4. Judging Nov 4–8.
Tracks: Indie Developer. Judging: Impact 30% + Meta Tooling 25% +
Technical 20% + Demo 25%.

## 2. Repo / stack / branches
- Repo: github.com/sanlorenzoprx/suredose
- Work ONLY in GitHub Codespaces (old slow PC, slow connection).
  Never local Cursor.
- Working branch: pre-hackathon-fixes. Do NOT merge to main or tag
  pre-hackathon until the real-phone checklist in PHONE_TEST_RESULTS.md
  passes (see STOP RULE below).
- Stack: TypeScript/JS PWA + Cloudflare Workers/R2 + Web Push (VAPID)
  + Google Vertex vision (LIVE) + OpenFDA + Neon-style SQL via
  DATABASE_URL (PGLite fallback at startup in db.ts).
- Rollback points: 0ad4cca (original pre-hackathon). Never delete.
- Commit history landmarks: b0d8391 (provider switch, 294 tests) →
  b6d6c41 (mock simulations) → b942fa2 (simulation env fix) →
  caregiver-join commit (306) → 50e8d47 (strength fix, 312) →
  2e981b0 (vision rate limit, 318). A later server-only boundary fix
  is currently uncommitted; verify actual git state before relying on
  these commit IDs.
- ALWAYS verify real state first, never trust this file's commit IDs:
  git status --short --branch && git log -3 --oneline

## 3. HARD RULES (never break)
1. Live app (Cloudflare) stays VISION_PROVIDER=google.
   Do NOT set meta in Cloudflare. Meta model/API details were
   placeholders; do not deploy a guessed Meta model/URL.
2. Never hallucinate a drug name. Obscured label = needs_manual_check.
3. Never mark a dose taken except through the existing pill-check flow.
4. Never paste secrets in chat, code, commits, screenshots, or issues.
   Secrets live in Cloudflare (Workers > Settings > Variables and
   Secrets, type = Secret). GOOGLE_SERVICE_ACCOUNT_JSON was pasted
   into the Cloudflare Secret field — that is CORRECT and safe,
   do NOT rotate the Google key unless it was exposed anywhere else.
5. Two agents never edit at once. One task, run gates, review diff,
   commit, then next task.
6. Do not approve any GitHub/Cloudflare device code unless it came
   from your own current terminal.
7. STOP RULE: any real-phone checklist failure = no merge, no tag,
   create a GitHub Issue first.
8. Features beyond the "wanted flow" in section 7 are POST-hackathon.

## 4. Automated gates (baseline Nov 2)
npm run typecheck = PASS. npm test = 318/318 PASS.
All tests mock external APIs (Vertex, Meta, OpenFDA, push). Tests cost $0.
Migrations: `npm run build` runs `npm run db:migrate`
(scripts/migrate.mjs) when DATABASE_URL is set; otherwise PGLite
fallback migrates at startup. Migrations so far: 0006_household_members
(caregiver join), 0007_vision_rate_limits (rate limit).

## 5. Done and committed/pushed
- 7-step 2-phone checklist: steps 1,4,5,6,7 PASS on real phones.
  Step 2/3 see section 6.
- Caregiver server join: joinHousehold server fn, migration 0006,
  idempotent per-browser device id, FIRST caregiver = isPrimary,
  getHousehold returns caregivers primary-first. (306 tests)
- Strength fix: strengthMatches() in src/lib/drug-data.ts normalizes
  BOTH sides (20 MG == 20MG == 20.0MG). 40MG and 20MCG still fail
  correctly. src/lib/drug-verify.test.ts contains the regression tests. (312)
- Vision rate limit: shared per-IP token bucket, burst 3, refill
  1 token / 3 min (env VISION_RATE_LIMIT, VISION_RATE_REFILL_MINUTES).
  IPs SHA-256 hashed, persisted in DB (migration 0007,
  src/lib/vision-rate-limit.ts). Applied to readBottleLabel,
  comparePills, cachePillReference; bottle photo + its OpenFDA
  verification share ONE token. Blocked = existing manual-check
  (ok:false, no drug name, nothing marked taken, ZERO external calls).
  Manual typing, dose logging, double-dose guard, family join, push
  are NOT rate limited. (318)
- Google secret: GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_CLOUD_PROJECT
  are set in Cloudflare as Secrets. vertex.ts checks
  GOOGLE_VERTEX_API_KEY FIRST — an old bad key secret would shadow
  the JSON and break vision.

## 6. Historical blocker (Nov 2) — superseded by verified state above
Bottle API failure is FIXED in code, but the live (deployed) app does
not have today's fixes yet. On Phone 1, furosemide bottle read
correctly (name FUROSEMIDE filled) but showed a false strength warning —
that was the 20 MG vs 20MG bug now fixed in code.

The latest `npm run cf:deploy` attempt:
- Production build succeeded after the drug-lookup code was moved behind
  a server-only boundary in `src/lib/drug-verify.server.ts`.
- Migration command reported:
  `[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).`
- Wrangler did not deploy. It requires `CLOUDFLARE_API_TOKEN` in this
  non-interactive Codespace, or Wrangler login/account authentication.
  Nothing was deployed.
- The server-only boundary fix remains uncommitted. At the last verified
  status, the dirty files were `src/lib/ai.ts`,
  `src/lib/drug-verify.test.ts`, `src/lib/drug-verify.ts`, and new
  `src/lib/drug-verify.server.ts`. Do NOT discard them.

NEXT ACTIONS, IN ORDER:
1. Run `git status --short --branch && git log -3 --oneline`. Preserve
   all existing uncommitted work; do not stash or discard it.
2. Run `npm run typecheck && npm test` (last verified: PASS, 318/318).
3. Review `git diff --stat` and the untracked server-only helper.
4. When ready, stage only the server-only boundary files:
   `src/lib/ai.ts`, `src/lib/drug-verify.ts`,
   `src/lib/drug-verify.test.ts`, `src/lib/drug-verify.server.ts`,
   plus `SUREDOSE_MEMORY.md` if making the next commit.
5. Commit and push only when explicitly requested/approved.
6. Do not approve any device code except one displayed by your own
   current terminal. Verify account with `npx wrangler whoami`.
7. Check whether DATABASE_URL is set in build environment; print only
   set/not set.
8. Retry `npm run cf:deploy` only when authorized and authenticated;
   record the migration line from output.
9. Phone 1 re-test: readable bottle (expect name+strength, NO warning,
   "Checked with the U.S. drug list"), correct pill green check,
   wrong pill red X. Space photo checks ~1 min apart — both phones on
   home WiFi share ONE rate-limit bucket.

## 7. WANTED FLOW (must-have if time, cut off tonight Nov 2)
Missed dose → caregiver Phone 2 alert shows THAT pill's reference
image + name + strength + due time → caregiver taps "Video Check-in"
OR sends reply "Take this pill, love ❤️" (or "Are you okay?" /
custom max 160 chars) → Phone 1 gets reply, can tap same Video
Check-in or "Check my pill".
Key rules for whoever builds it: Jitsi room =
https://meet.jit.si/suredose-[first 20 chars of SHA-256 hash of
household/family code + dose occurrence ID] — no names/medicine/code
in URL. Reply stored server-side with UNIQUE idempotency key; sender
must be a household member (migration 0006); "Follow-up done" logs
exactly once; viewing a reply never marks a dose taken. Mock push in
tests.
One combined prompt for this flow was given in chat on Nov 2. If not
green by end of Nov 2, ship image+name alert only (no reply/video).

## 8. Known gaps (mostly POST-hackathon)
- SMS/email registration: not built. Do not build before Nov 4.
- Auto-generate family text code: partial via caregiver join work.
- Phone 2 disconnect risk is FIXED server-side (section 5), pending
  live deploy verification (section 6).
- Meta provider: built but NOT live. Meta $150 credits expire after
  the 10-day window; judging may outlive them. Google fallback must
  ALWAYS stay live — it is the demo safety net.

## 9. Cost
Judges testing ≈ under $1–5 total. Vision calls are the only cost;
OpenFDA, push, Cloudflare free tier are $0. Rate limit caps runaway
risk. Do not remove Google fallback for cost reasons.

## 10. UI cleanup method (Nov 3, after deploy)
Screenshot loop only — never one big "clean the UI" prompt.
Judge-visible screens only: Home, Add Medicine, Check Pill
(green/red result), Family. One small prompt per screen, run gates,
re-screenshot. Freeze code Nov 3 noon. Record demo on phone Nov 3:
wrong pill RED X → correct pill GREEN CHECK → Phone 2 missed-dose
alert with pill image → Video Check-in / "Take this pill, love ❤️".
PRIVACY: do NOT use the furosemide screenshot from chat in the demo —
it shows a patient name on the label. Cover names on all demo bottles.

## 11. Submission checklist (Nov 4, by noon ET)
Portal: cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit
Needed: project name + 1-line description, Indie track, demo video
link (plays without login), GitHub repo link, Meta tooling actually
deployed (only claim what is live). Upload video EARLY (slow connection).

## 12. How to restart in a NEW chat (paste this)
"Read SUREDOSE_MEMORY.md at the repo root and run
git status --short --branch && git log -3 --oneline.
You are my lead developer; I only copy/paste and test on phones.
Take over one task at a time, always run npm run typecheck and
npm test, show me git diff --stat before any commit, never deploy
or change secrets/VISION_PROVIDER unless I confirm the report
format you asked for. Start from section 6 unless it is done."
