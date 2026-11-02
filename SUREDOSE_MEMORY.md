# SUREDOSE MEMORY — READ THIS FIRST
Last updated: Nov 2, 2026. Owner updates this after EVERY task.

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

## 6. CURRENT BLOCKER (Nov 2) — deploy not yet live
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
