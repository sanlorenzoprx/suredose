# SUREDOSE MEMORY — HOT STATE

Last updated: Nov 4, 2026

## Current status (Nov 4, 2026, ~7 PM ET)

- MERGED: PR #1 (pre-hackathon-fixes) merged into main as 205f121 (merge
  commit; CI green on b7afe9f). NO release tag created. The merge was made on
  an ambiguous "merge now?" message; the owner may want it reverted (a revert
  commit, never a force push). Live deploys come from the branch, so the live
  app was not affected by the merge.
- Live: Worker suredose-test, domain https://suredose.app (BETTER_AUTH_URL set
  to it; workers.dev can no longer sign in). D1 migration 0003 applied
  (restore bookmarks before 00000422-00000000-00005119-f82110c675abfeabe528ceb2ebca14cc,
  after 00000423-00000006-00005119-eb38730407f2edafca4442bbf9d0be4c). Do not rerun.
- Secrets (names): BETTER_AUTH_SECRET, BETTER_AUTH_URL, META_API_KEY,
  GOOGLE_SERVICE_ACCOUNT_JSON, OPENFDA_API_KEY, VAPID_PRIVATE_KEY,
  VAPID_SUBJECT, VITE_VAPID_PUBLIC_KEY, VISION_RATE_LIMIT,
  VISION_RATE_REFILL_MINUTES, ZEGO_APP_ID, ZEGO_SERVER_SECRET. Set limits as
  secrets (a deploy wipes dashboard vars).
- Vision: Meta Muse first, Google fallback (live: provider=meta result=used).
  Muse timeout 20s. Pill reads need a sharp photo ~20 cm away (phone cameras
  cannot focus close); the app names which photo is blurry.
- Video: /video uses ZEGOCLOUD prebuilt (token built server-side, SDK served
  from public/vendor/zego); falls back to Jitsi and shows a "Reason:" code.
  NOT yet verified on two real phones.
- Push: a caregiver phone must tap Home > "Alerts on this phone" > Turn on
  alerts (the Family-page button only enables local notifications).
- Still NOT run: real-phone checklist (PHONE_TEST_RESULTS.md). Install-to-home
  screen not offered on the owner's Android Chrome (skipped, not critical).
- Branch d1-port (other agent) diverged; NOT merged; left untouched.
- Flaky test: "D1 atomic token bucket..." fails intermittently; not triaged.

## Remaining
1. Confirm ZEGOCLOUD works on two phones (read the Reason: line if it falls back).
2. Caregiver push: Turn on alerts, then dose/call notification arrives.
3. Real-phone checklist; record in PHONE_TEST_RESULTS.md. Tag only after it passes.
4. Submission: track unresolved; write-up, demo script, QR code for suredose.app.
5. Cleanup: delete eval Google key, eval-photos/eval-results, unneeded
   Codespace secrets; remove VISION_PROVIDER secret if set.

## Project

SureDose: PWA preventing wrong-pill mistakes. Patient photographs
bottle + pill; AI vision reads drug/strength and imprint; verified
against OpenFDA; GREEN CHECK (right pill) or RED X (wrong pill).
Caregiver (Phone 2) gets push alerts for taken/missed doses.
Hackathon deadline Nov 4, 2026, 9PM ET; owner target noon ET Nov 4.
Submission track is unresolved in historical notes — do not infer
or change it without user confirmation.

## Hard rules

1. Vision order (user decision Nov 4, 2026, for the Meta hackathon):
   Meta Muse FIRST, Google Gemini as the safety fallback. Do NOT force
   VISION_PROVIDER=google on suredose-test; leave it unset (auto).
   Status: Muse answers but its label reads were judged unreadable on
   a poor label that Gemini reads fine; per-scan logs (commit 741f80b)
   name the reason. Goal: get Muse to read labels itself (model name,
   prompt, response format), not to drop it. Never deploy a guessed
   Meta model/URL; confirm model names with Meta's /v1/models first.
2. Never hallucinate a drug name. Obscured label = needs_manual_check.
3. Never mark a dose taken except through the pill-check flow.
4. Never paste or print secrets anywhere (chat, code, commits, shots).
5. One agent/task edits at a time.
6. Never approve a device code not from the user's own terminal.
7. STOP RULE: any real-phone checklist failure = no merge, no tag;
   create a GitHub Issue first.
8. Do not merge pre-hackathon-fixes to main or tag pre-hackathon
   until the current real-phone checklist passes.
9. Never delete rollback point 0ad4cca.
10. No user approval required for routine commits/pushes to the
   working branch. Workflow: Muse creates code -> run gates ->
   commit -> push -> Copilot reviews. Before committing, still run
   git diff --stat / git diff --check and report the result.

## Confirmed target

- Test URL: https://suredose-test.sanlorenzoprx.workers.dev/
- Worker: suredose-test (the separate "suredose" Worker is NOT the target)
- Repo: https://github.com/sanlorenzoprx/suredose
- Always verify first: git status --short --branch && git log -3 --oneline

## D1 database state

- D1 read access confirmed; no credential changed.
- Bound DB ID f0ff8234-58ff-420f-9ffa-b5363ed713ad; DB name: suredose.
- Live preflight FAILS on incomplete schema, not permissions.
- Live schema: 7 existing app tables + d1_migrations
  (0001_init.sql, 0002_household_timezone.sql). Extra
  households.timezone must be retained. No patient rows were read.
  No live SQL writes have run; write permission untested.

## Prepared migration — NOT approved, NOT applied

- File: migrations/d1-reviewed-upgrades/0003_current_app_support.sql
- Tracked in commit c5ca712 and pushed with the branch. Committing
  or pushing the file did NOT apply it; it is NOT approved for
  live use and has NOT been applied to the live database.
- Additive design: 7 missing tables, indexes, 4 columns, schedule
  start backfill/trigger. Locally rehearsed PASS on synthetic old
  schema, preserving rows and households.timezone.
- Before any explicitly approved live apply: read D1_DATABASE_FIX.md,
  recheck schema/history, capture a fresh Time Travel bookmark,
  set a maintenance window, re-review the SQL. Restore is destructive
  and separately approved. Deployment is a separate approval.
- Do NOT blindly apply migrations/d1/0001_initial.sql or
  0002_dose_alert_delivery.sql to the live DB; history may not align.

## Code state

- Native D1 support implemented locally (src/lib/d1.ts); PostgreSQL
  and Node-only PGlite still supported; Workers without a durable DB
  fail explicitly. Better Auth uses native D1 adapter; no origin/
  session policy relaxed. Local D1 migration/schema checks PASS.
- Release checks still open: stable BETTER_AUTH_SECRET, intended
  BETTER_AUTH_URL, VAPID public build key. Do not change secrets
  or provider settings while resolving these.

## Evidence limits

Local/synthetic evidence (352 tests, built pill-flow checks PASS on
local D1, desktop/mobile renders PASS, screenshots/ verdicts) does
NOT prove real Google recognition, Android camera behavior, real
push delivery, or deployed config. Real-phone outcomes remain
NOT RUN — see PHONE_TEST_RESULTS.md and PRE_LIVE_TEST_CHECKLIST.md
(read only before phone testing/release). Jitsi video call (Family page button + push nudge) is
implemented but untested on real phones;
caregiver reply flow is NOT implemented.

## Gates after any code change

npm run typecheck && npm test && git diff --check && git diff --stat
Report failures honestly; never claim phone/live verification not run.

## Next step

1. Read this file and D1_DATABASE_FIX.md.
2. git status --short --branch && git log -3 --oneline
3. Review migrations/d1-reviewed-upgrades/0003_current_app_support.sql.
4. Present the migration/release report. Live migration, live deploy,
   secret/provider changes, merge, and tag remain separate safety
   gates — they are not routine code commits.

## Archive

Full history: SUREDOSE_MEMORY_ARCHIVE_2026-11-03.md
(sha256 8a6dcd7024f792e72e7c2b6bac12064a62c8967849256a89f8f108c67760cf84)
Read only for a specific historical question; never by default.
