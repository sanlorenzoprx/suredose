# Codespace 2-Phone Simulation Results

## Run configuration

- `VISION_PROVIDER=google`
- Automated gates: `npm run typecheck` — **PASS**
- Automated gates: `npm test` — **PASS** (301 tests; 301 passed, 0 failed)
- No deployment, real API keys, real external API calls, or real push notifications.

## Simulation results

|   # | Result | Test name                                                                                  |
| --: | ------ | ------------------------------------------------------------------------------------------ |
|   1 | PASS   | `Phone simulation 1: Phone 1 creates a family code and Phone 2 joins`                      |
|   2 | PASS   | `Phone simulation 2: readable bottle fills name and strength and calls mocked OpenFDA`     |
|   3 | PASS   | `Phone simulation 3: covered label follows manual check with no invented drug name`        |
|   4 | PASS   | `Phone simulation 4: correct pill imprint produces the green-check result`                 |
|   5 | PASS   | `Phone simulation 5: wrong pill imprint produces a red X and does not mark a dose taken`   |
|   6 | PASS   | `Phone simulation 6: taken dose is rejected on a second accidental log`                    |
|   7 | PASS   | `Phone simulation 7: cron marks a dose missed after 2h15m and captures one caregiver push` |

## Mocking and scope

- Google Vertex responses use local fixtures; Meta vision was not called. Bottle and pill parsing/matching use the production vision-check functions.
- The OpenFDA lookup and family pairing use in-memory mocks, with source-contract assertions against the app's wiring.
- The repeat-dose flow uses an in-memory dose record and checks the existing-taken guard in the app route.
- The actual missed-dose task ran twice with a fixed clock, mocked SQL, and a captured `push-mock.invalid` endpoint. It flagged the dose once and made one captured push attempt.
- No phones or devices were connected; this is a deterministic code simulation, not physical-device QA.

The test runner emitted a non-blocking Nitro stub warning while loading the scheduled task; all tests passed.
