# SureDose pre-live-test readiness — Nov 3, 2026

Latest: D1 compatibility is implemented and verified locally; see
`D1_DATABASE_FIX.md`. The remote schema inspection/upgrade remains blocked by
Cloudflare D1 permissions. Earlier automation evidence below describes HEAD
03af87f, not the uncommitted D1 fix. Do not deploy before reviewing the live schema.

## Verified code and automation

- Remote `pre-hackathon-fixes` and local HEAD both resolve to
  `03af87fddf6bc71e741cf3421678a599b45e2fd4` (read directly from GitHub).
- [PR #1](https://github.com/sanlorenzoprx/suredose/pull/1) is open.
- [Verify run 27](https://github.com/sanlorenzoprx/suredose/actions/runs/41604012614)
  is successful: test, typecheck, build, browser. Both dev and Cloudflare browser
  regression steps passed. This checks repository HEAD, not uncommitted changes.
- Local worktree: 347 tests, typecheck and production build passed; dev/built
  screenshots inspected; all 13 synthetic pill-flow browser checks passed using
  disposable PostgreSQL for the Worker. No real model or push accuracy claim.

## Confirmed test deployment and read-only inspection

- User-confirmed URL: https://suredose-test.sanlorenzoprx.workers.dev/
- Worker: `suredose-test`. Repository: https://github.com/sanlorenzoprx/suredose
  (source/migration code, not the running database).
- Latest listed deployment `dfaf3206-e0e7-4a49-b65f-b93294835954`, created
  `2026-11-02T15:58:57.429097Z`, routes 100% to version
  `2648c6bc-ecee-4ad9-8e42-a7e5a9bf69b6`. Its Git commit remains unverified.
- Version bindings: ASSETS (assets), DB (Cloudflare D1),
  GOOGLE_SERVICE_ACCOUNT_JSON, OPENFDA_API_KEY, PILL_IMAGES (R2),
  VAPID_PRIVATE_KEY and VAPID_SUBJECT. The four secret names are confirmed;
  their values were neither printed nor tested. Earlier empty-secret findings
  targeted a DIFFERENT Worker, `suredose`, and do not apply to this URL.
- **Database compatibility gate:** no DATABASE_URL binding was listed. The
  reviewed repository uses PostgreSQL or local embedded PGlite, not D1. A bound
  D1 database does not satisfy this code's PostgreSQL dependency. Do not overwrite
  this deployment or apply PostgreSQL migrations to D1. Preserve existing data
  and authorize an explicit compatibility/data migration plan first.
- No database rows/schema, model calls, push sends, secret writes, migrations or
  deployments were performed. This inspection establishes names/configuration,
  not recognition accuracy, database health or delivery readiness.

## Reviewed changes prepared for a later commit

No changes are staged or committed in this pass. Proposed title:
`Make browser verification and preview startup portable to Codespaces`.

| Files | Result / scope |
|---|---|
| `scripts/browser-guard.mjs`, `browser-smoke.mjs` | Allow the real project root for screenshots and read its share-card assets |
| `scripts/suredose-ui-smoke.mjs` | Save browser evidence under the real project root |
| `scripts/browser-smoke-verdict.test.mjs` | Keep existing guard-wiring assertions aligned |
| `startup.sh` | Resolve root from script path; detach the npm dev process with nohup/setsid |
| `src/lib/app-data/client.server.ts` | Comment-only cleanup; no runtime change |
| `src/lib/vision-rate-limit.test.ts` | Immutable local test variable; no behavior change |
| `SUREDOSE_MEMORY.md`, `PHONE_TEST_RESULTS.md`, this file | Current evidence, deployment gates and an untested phone run sheet |

Review screenshot evidence before selecting it for any later commit. Runtime logs,
PID files, temporary Worker bindings and obsolete failure screenshots are not
release assets. `git diff --check` is clean. No actionable regression was found
in the current code diff; verification-script root handling was checked in the
current Codespace. Commit/push still requires the user's authorization.

## Deployment gates — confirm before real-phone testing

These are requirements to verify, not authorization to deploy or alter secrets.
Live schema and environment values are not inferred from local tests or secret names.

| Gate | Required evidence / action | State |
|---|---|---|
| Release identity | Record authorized commit, active Worker version and HTTPS URL; verify both phones use that version | URL/Worker confirmed; Nov 2 version has no verified Git provenance |
| Google provider | Keep effective `VISION_PROVIDER=google`; verify intended live `VERTEX_MODEL` is available for the configured Google project/location | PENDING runtime verification |
| Google credentials | Confirm the selected authentication mode works; API key takes precedence over service-account JSON, so an unintended old key can shadow the JSON | Service-account secret listed on suredose-test; runtime authentication unverified; no rotation authorized |
| Database | Real production PostgreSQL reachable from Worker; no PGLite fallback. The unconfigured Worker rendered but photo-check server calls failed | D1 code path locally verified; BLOCKED on remote schema access/upgrade review |
| Migration 0008 | Confirm `_migrations` contains `0008_dose_alert_delivery.sql` before releasing code that uses its timezone/lease columns | PENDING live schema evidence; local isolated migration passed |
| Timezone resync | Reopen patient app after release and confirm schedule sync; legacy NULL timezone schedules are skipped for missed alerts | PENDING |
| Caregiver push | Matching VAPID public/private key configuration and subject; public key present in build; caregiver permits notifications and retains subscription | Private key and subject secrets listed; build-time public key and real delivery unverified |
| Background schedule | Active Cron Trigger every 15 minutes, with the deployed missed-dose task | PENDING live trigger verification |
| References | Replace incomplete one-sided references; capture readable front and reverse evidence | PENDING phone setup |
| Live test record | Fill actual release/device/timezone metadata and execute `PHONE_TEST_RESULTS.md` | NOT RUN |

The ordinary dose-confirmation window is from scheduled time through 2 hours
later on the patient's current local date. Photo-check rate limiting is a shared
per-IP burst of 3 with one token refilled every 3 minutes by default. Plan separate
test occurrences for confirmation and missed-dose alerts, and do not change real
prescription timing just to exercise tests.

No merge to main or pre-hackathon tag until the real-phone checklist passes. Any
real-phone failure requires a GitHub Issue first. Recognition tests remain limited
to visible-feature comparison against references; a green fixture is not proof
of real-world recognition accuracy. Do not claim planned caregiver replies/video
or pill-image missed alerts are complete.
