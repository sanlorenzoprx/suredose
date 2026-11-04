# Phone Test Results

> **STOP RULE:** If any real-phone test FAILS, do not merge to main or tag
> pre-hackathon. Create a GitHub Issue before proceeding. Do not mark synthetic
> browser results as real-phone passes.

## Current run — prepared Nov 3, 2026; NOT RUN

| Field | Value |
|---|---|
| Branch | `pre-hackathon-fixes` |
| Reviewed repository HEAD | `03af87fddf6bc71e741cf3421678a599b45e2fd4` |
| Uncommitted changes | Verification tooling, startup, cleanup edits and documentation; not in GitHub CI |
| Actual deployed commit / Worker version | `suredose-test` version `2648c6bc-ecee-4ad9-8e42-a7e5a9bf69b6` (Nov 2); Git commit NOT VERIFIED |
| Deployed HTTPS URL | https://suredose-test.sanlorenzoprx.workers.dev/ (user confirmed) |
| Phone 1 / Phone 2 model and Android / Chrome versions | NOT RECORDED |
| Patient IANA timezone / test start time | NOT RECORDED |
| Live vision provider / model | Required: Google; actual runtime values NOT VERIFIED |
| Reference photos | Capture both sides, including readable blank reverse; replace old one-sided references |

## Automated evidence (separate from phone testing)

| Gate | Evidence |
|---|---|
| GitHub CI at reviewed HEAD | [Verify run 27](https://github.com/sanlorenzoprx/suredose/actions/runs/41604012614): test, typecheck, build and browser jobs PASS |
| Current local worktree | 347 tests PASS; typecheck PASS; production build PASS |
| Desktop / mobile rendering | Development and built Worker PASS; inspected screenshots; clean console; no overflow or baseline divergence |
| Synthetic pill-flow browser regression | 13 checks PASS in dev and built Worker with isolated PostgreSQL; recognition results were simulated |
| Real Google recognition / real Web Push | NOT TESTED in this verification pass |

## Readiness blocker

The confirmed `suredose-test` Worker has Google service-account and push secrets,
and a Cloudflare D1 database bound as DB. The uncommitted database fix now supports D1 and passed local Worker tests;
the live schema upgrade and deployment have not been verified. Resolve this release
gate and verify the deployed source before releasing repository code or starting
the current-release checklist. Do not modify or discard existing D1 data.

## Before starting

- Complete the deployment gates in `PRE_LIVE_TEST_CHECKLIST.md`; record the actual
  deployed version above. Test the same release on both phones.
- Use staged test items and test schedules. Do not take an extra dose to test the
  app. Use Practice for comparison-only trials; it must record no dose or message.
- Cover patient names and other private label details in evidence. Never include
  family codes, credentials or account details in screenshots or Issues.
- Phones on the same Wi-Fi share one photo-check bucket: burst 3, then one token
  refills every 3 minutes by default. Allow at least 3 minutes between later photo
  checks when the burst is exhausted. A blocked check is not a recognition result.
- A green result means extracted features matched the saved reference; it is not
  independent proof of medication identity or medical dosing advice.

## Real-phone checklist

Record PASS, FAIL or NOT RUN for each row; add time, observed wording and redacted
photo evidence. A missing result is not a pass.

| # | Test and expected result | Result | Phone | Time | What I saw / evidence | Issue # |
|---:|---|---|---|---|---|---|
| 1 | Pair Phone 1 and Phone 2; caregiver sees the intended test household and medicine schedule | NOT RUN | 1 + 2 | | | |
| 2 | Read a clearly printed bottle: correct name and strength, with no false strength warning; select reminder times explicitly and acknowledge directions | NOT RUN | 1 | | | |
| 3 | Cover or blur the label: no invented name/strength, no guessed reminder times, manual-check outcome | NOT RUN | 1 | | | |
| 4 | Camera opens; gallery selects an existing photo without forcing camera; both reference sides can be saved | NOT RUN | 1 | | | |
| 5 | Fresh photos of the correct pill: supply both sides when requested; expected matching result; no dose recorded before explicit confirmation | NOT RUN | 1 | | | |
| 6 | A visibly different pill/imprint: wrong-pill result, no take-confirmation action and no dose recorded | NOT RUN | 1 | | | |
| 7 | Blurry/unreadable imprint: uncertain/retake outcome; no actionable green result or dose record | NOT RUN | 1 | | | |
| 8 | Submit exact saved reference photo: rejected as saved-photo replay; no dose or caregiver activity recorded | NOT RUN | 1 | | | |
| 9 | Complete Practice: no dose event, family message or suppressed future reminder | NOT RUN | 1 + 2 | | | |
| 10 | Confirm one staged due test occurrence once; caregiver receives its activity; reload/reopen cannot record it twice | NOT RUN | 1 + 2 | | | |
| 11 | Future, stale-date, unconfigured-time and more-than-2-hours-late links cannot record a normal dose | NOT RUN | 1 | | | |
| 12 | Enable caregiver notifications; leave an explicitly scheduled test dose untaken, close both apps, and observe missed alert after 2 hours plus the next 15-minute cron interval; record actual arrival time | NOT RUN | 1 + 2 | | | |

For row 12, reopen the patient app after release to sync its timezone first.
A successful push-service send is not proof a person saw the notification. An
unexpected delivery failure remains a FAIL even if a later retry succeeds; record
both attempts. This checklist does not assert that the planned video/reply flow
or pill-image missed-alert feature has shipped.

## Historical baseline

The prior file referenced commit `b0d8391`, Node `v24.22.2`, and 294 passing
synthetic tests. Its seven phone-test rows were all blank. No completed phone
results were replaced by this update. Historical reports elsewhere in memory
are not a completed checklist for the current release.
