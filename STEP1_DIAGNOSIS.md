# STEP 1 Diagnosis: Family Connection, Push Alerts, and AI Provider

Scope: diagnosis only. No application code was changed and no deployment or live AI test was attempted.

## 1. Family connection

- **Create a code:** `createHousehold` in `src/lib/care.ts` generates a six-character code and inserts a row into `households`. `ConnectFamilySection` in `src/routes/family.tsx` calls it, saves the returned code locally, and starts syncing the patient's medicine list.
- **Join a code:** `getHousehold` in `src/lib/care.ts` looks up the code and returns the patient's name. The `CaregiverJoin` form in `src/routes/index.tsx` calls it; there is no separate server-side join/membership insert.
- **Joined state:** the caregiver form sets `settings.role`, `settings.householdCode`, `settings.patientName`, and `settings.onboardingDone` in the Zustand store. `src/lib/store.ts` persists `settings` to browser local storage under `suredose-v1`. The family route is the patient-side create/manage UI; joining is in the onboarding route.
- **Medicine sync:** `useCareSync` in `src/lib/care-sync.ts` only syncs when the local role is `patient` and a household code exists. It mirrors medicine name, strength, and times.

## 2. Push and alerts

- **Client key:** `src/lib/push-client.ts` reads `VITE_VAPID_PUBLIC_KEY` through `import.meta.env`, so the browser's copy is baked into the client build. If absent, enabling alerts returns “Alerts are not set up yet for this app.”
- **Worker keys:** `vapidKeys()` in `src/lib/push.server.ts` separately reads `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` from `process.env` at send time. All three are required; if any is missing, `sendPushToHousehold()` silently returns. Therefore a build-time browser key alone is insufficient: the public key must also be available to the Worker at runtime (as a plain variable); the private key and subject are server-side Worker secrets. `wrangler.jsonc` currently has no `vars` block.
- **Matched pair:** the public and private VAPID keys must be generated as a pair. A mismatch can make the push service reject the signed request (commonly HTTP 401/403); `sendPushToHousehold()` logs non-success statuses but does not return an error to the app. A changed public key can also leave existing browser subscriptions tied to the previous key.
- **Where subscriptions live:** `subscribePush` in `src/lib/care.ts` upserts the endpoint and keys into `push_subscriptions`; the table is defined in `migrations/0002_care_circle.sql` and belongs to a household. `enableCaregiverAlerts()` in `src/lib/push-client.ts` creates/updates that row after browser permission and subscription.
- **Push send paths:** there is no production “test push” action found. A taken-dose push is initiated by `recordDoseEvent` in `src/lib/care.ts`; missed-dose pushes come from `server/tasks/care/missed-doses.ts`, scheduled every 15 minutes. The “Send test text” control in the family UI is SMS, not push.
- **Expired endpoints:** a push service response of HTTP 404 or 410 causes `sendPushToHousehold()` to delete that subscription row. No `{ok:false, error}` is returned; the sender returns `void`, and the user is not notified that the endpoint was removed.
- **Cloudflare secret check:** ran `npx wrangler secret list`. Wrangler could not authenticate because `CLOUDFLARE_API_TOKEN` is not configured in this environment. No secret values were printed; the requested names cannot be confirmed:

  | Name | Exists? |
  |---|---|
  | `VAPID_PRIVATE_KEY` | Not verified |
  | `VAPID_SUBJECT` | Not verified |
  | `DATABASE_URL` | Not verified |

## 3. AI provider

- `visionProvider()` in `src/lib/vision.ts` defaults to **Google**. Only an explicit `VISION_PROVIDER=meta` selects Meta; any other value (including unset) selects Google. A deployed Worker variable can override the default, so the live setting is not confirmed here.
- Google Vertex credential secret names from the implementation (names only): `GOOGLE_VERTEX_API_KEY` **or** `GOOGLE_SERVICE_ACCOUNT_JSON`. With service-account authentication, `GOOGLE_CLOUD_PROJECT` is additionally needed only when the JSON has no `project_id`; it is configuration and need not be a secret. The service account needs the Vertex AI User role. The secret-list command could not establish which names are actually set.
- `vertexVision()` in `src/lib/vertex.ts` returns these provider-level errors:
  - Not configured, invalid configuration, or request timeout (30 seconds): `{ ok: false, error: "AI is not available right now." }`
  - A successful Vertex response with no usable text: `{ ok: false, error: "AI did not return a result." }`
  - Vertex HTTP 429: `{ ok: false, error: "The photo checker is busy. Please try again in a minute." }`
  - Vertex HTTP 400: `{ ok: false, error: "Could not read this photo. Please try another picture." }`
- **Where errors reach the UI:** `readLabelPhoto()` in `src/lib/vision-checks.ts` passes provider errors through; malformed/unparseable bottle output is caught as `{ ok: false, error: "Could not read the bottle. Type the details from its label." }`. `src/routes/add.tsx` assigns `result.error` to `readError` and renders it. A thrown client/server call instead displays “Could not read the bottle. Type the name below.”
- `comparePillPhotos()` similarly passes provider errors through. Malformed/unparseable pill output becomes `{ ok: false, error: "We could not check this pill. Try again or ask your pharmacist." }`; `src/routes/check.tsx` assigns `res.error` to `error` and renders it. A thrown call displays “We could not check this photo. Try again, or ask your pharmacist.”
- A well-formed but unreadable pill response is not an `{ok:false}` provider error: it returns an uncertain result and the check UI displays the result's specific reason (for example, “The photo is blurry. Hold your phone still and try again.”). Google is returned directly by `vision()`; its general unreadable-output detector is only used on the Meta/fallback path. Bottle JSON with an empty name can also pass the current schema, so not every unreadable-looking response produces an error message.

## Validation

- `npm run typecheck`: **PASS** (`tsc --noEmit`, exit 0).
- `npm test`: **FAIL** — 301 tests total; 299 passed, 2 failed. Both failures are in `src/lib/phone-simulation.test.ts`: the test at line 81 expects `process.env.VISION_PROVIDER` to equal `"google"` but it is unset in this run; the test at line 99 expects the shared `calls.openFDA` list to contain 1 item but sees 0. The second failure follows because the first test aborts before adding that item. These simulation failures do not establish a live AI failure; the Vertex unit tests passed.

## Most likely causes (ranked; deployment values are unverified)

### (a) Alerts dropping

1. **Missing Worker runtime VAPID setting(s), especially the public key only being present in the client build.** `vapidKeys()` in `src/lib/push.server.ts` requires all three values and silently skips sending otherwise. Verify the public key is available to both the client build and Worker runtime, and the private key/subject are Worker secrets.
2. **No usable subscription row in the same production database.** `subscribePush` in `src/lib/care.ts` persists subscriptions through `getSql()`; `sendPushToHousehold()` queries those rows. Verify `DATABASE_URL` and that the family code and subscription are in the same database.
3. **VAPID pair mismatch or expired endpoint.** `sendPushToHousehold()` logs rejected non-404/410 responses and deletes 404/410 subscriptions without notifying the user. Recheck the pair and renew the caregiver subscription through `enableCaregiverAlerts()` in `src/lib/push-client.ts`.

### (b) AI not working

1. **No usable Google credential in the Worker.** `vertexConfig()` in `src/lib/vertex.ts` returns no configuration without `GOOGLE_VERTEX_API_KEY` or `GOOGLE_SERVICE_ACCOUNT_JSON`, producing “AI is not available right now.” Confirm a credential is configured and readable by the deployed Worker.
2. **A deployed `VISION_PROVIDER` value overrides the Google default.** `visionProvider()` in `src/lib/vision.ts` selects Meta only when explicitly set to `meta`; make the live Worker setting `google` for the requested test.
3. **Vertex project, role/API access, or request failure.** `vertexConfig()` / `vertexVision()` in `src/lib/vertex.ts` require a project for service-account auth when the JSON lacks one, and Google access must be enabled/authorized. Timeouts and most service errors collapse to “AI is not available right now.”
