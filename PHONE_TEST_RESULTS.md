# Phone Test Results

> **STOP RULE:** If any test FAILS, do not merge to main, do not tag pre-hackathon, create an Issue first.

## Run information

| Field | Value |
|---|---|
| Branch | `pre-hackathon-fixes` |
| Commit | `b0d8391` |
| Node | `v24.22.2` |
| VISION_PROVIDER | `google` (live app must stay on google until Oct 26) |

## Automated gates

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 294 tests, 294 passed, 0 failed |

## Phone checklist

| # | Checklist | Result (PASS/FAIL) | Phone (1/2) | Time | What I Saw | Screenshot filename | Issue # |
|---:|---|---|---|---|---|---|---|
| 1 | [ ] Phone 1 and Phone 2 connect successfully |  |  |  |  |  |  |
| 2 | [ ] Bottle label is read correctly |  |  |  |  |  |  |
| 3 | [ ] Covered label does not produce an invented medicine name |  |  |  |  |  |  |
| 4 | [ ] Correct pill receives a green check |  |  |  |  |  |  |
| 5 | [ ] Wrong pill receives a red X |  |  |  |  |  |  |
| 6 | [ ] Taken dose cannot be logged twice accidentally |  |  |  |  |  |  |
| 7 | [ ] Missed-dose notification reaches Phone 2 (wait 2h15m, apps closed) |  |  |  |  |  |  |
