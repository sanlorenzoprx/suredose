# SureDose — MVP

A medication reminder app for older adults. It reminds someone (by loud
chime, spoken words, and vibration) when it's time for a pill, checks a
photo of the pill against a saved reference photo before they take it, opens
a pre-written text message to a family member once it's confirmed — and now
a family member's own phone can pair to see that same confirmation with the
photo, and gets alerted automatically if a dose is missed.

## What this actually is

This is a **web app (PWA)**, not a native Android Studio project. On an
Android phone, the person opens it in Chrome once and taps **"Add to Home
screen"** — after that it has its own icon, opens full-screen, and works
like any other app. On Google Play specifically, a PWA can be listed via
**Trusted Web Activity** (a thin wrapper Google supports natively — tools
like Bubblewrap or PWABuilder generate it from the deployed URL, no
rewrite needed) if you want a Play Store listing later; that's a separate,
later step and doesn't require any changes to this code.

## Deploys to Cloudflare Workers

This runs on Cloudflare Workers (via Nitro's `cloudflare_module` preset).
Three things must be set up before the caregiver-facing features work in
production — the reminder/schedule/photo-check/SMS parts of the app don't
need any of this and work with nothing configured:

1. **A real Postgres database.** Locally, with nothing configured, the app
   falls back to an embedded in-memory Postgres — fine for trying things out
   on one machine, but a caregiver's phone and the patient's phone are two
   separate devices that both need to reach the *same* database, so this
   fallback cannot work once deployed. Get a free one at
   [neon.tech](https://neon.tech) and set it as `DATABASE_URL`.
2. **A VAPID key pair**, for sending push notifications to the caregiver's
   phone. Generate one with `npx web-push generate-vapid-keys` and set
   `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`
   (`mailto:you@example.com` or an `https://` URL).
3. **An R2 bucket** for official pill photos:
   `npx wrangler r2 bucket create suredose-pill-images` (the `PILL_IMAGES`
   binding is already in `wrangler.jsonc`), and a free **openFDA API key**
   (`OPENFDA_API_KEY`). Without R2, e.g. local `npm run dev`, photos are
   kept in Postgres instead.

4. **An xAI API key**, for the AI photo/label reading. Get one at
   [console.x.ai](https://console.x.ai) and set `XAI_API_KEY`.

See `.env.example` for the full list with explanations.

```bash
npm install
npm run dev            # local dev server at http://localhost:8080

# Deploy to Cloudflare:
npx wrangler login
wrangler secret put DATABASE_URL
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT
wrangler secret put XAI_API_KEY
# VITE_VAPID_PUBLIC_KEY isn't secret — it's baked into the client build, so
# set it as a plain var in wrangler.jsonc (or export it before building).
npm run cf:deploy      # builds, then `wrangler deploy`
```

`npm run cf:dev` runs a local Cloudflare-accurate preview (via Wrangler /
Miniflare) if you want to test closer to production before deploying.

The missed-dose check runs automatically every 15 minutes as a native
Cloudflare **Cron Trigger** — Nitro generates that trigger config at build
time, so there's nothing extra to set up beyond deploying. (Worth a quick
check in the Cloudflare dashboard → Workers → your app → Triggers after the
first deploy, just to confirm it shows up — see "What I could not verify"
below.)

### Why Cloudflare over Vercel here

Both work, but Cloudflare's free plan allows Cron Triggers as often as every
minute; Vercel's free Hobby plan only allows a cron job once a day (anything
more frequent needs the $20/mo Pro plan). Since the missed-dose check wants
to run every 10–15 minutes, Cloudflare's free tier is the better technical
fit for this specific feature, not just a cheaper one.

## What's already built

- **Add a medicine**: photograph the prescription bottle → AI reads the
  name, strength, NDC and schedule → the app checks it against official U.S.
  drug data and asks "Is this your medicine?" (no typing unless the check
  fails) → the pill picture: the maker's official photo from the FDA label
  ("Does your pill look like this?") or the person's own photo. See
  "Medicine verification" below.
- **Reminders**: loud chime, spoken reminder ("It is time to take your
  Lisinopril"), and vibration, repeating until acted on.
- **Take a pill**: photograph the pill in hand, AI compares it to the saved
  photo, and gives a plain-language "this is right" / "put it back" / "not
  sure — compare these two photos yourself" result, with both photos shown
  side by side whenever the person needs to double-check by eye.
- **Family text**: after a confirmed dose, opens a pre-written text message
  to the saved family phone number — the person just taps Send (see note
  below on why this is one tap, not silent).
- **Pair a caregiver's phone**: from the Family tab, the patient creates a
  short family code and texts it to a family member. On the caregiver's own
  phone, they enter that code once. From then on:
  - The caregiver's Home tab shows an activity feed of taken/missed doses,
    **with the confirmation photo**, refreshed automatically.
  - The caregiver can turn on phone notifications for that feed — a real
    push notification, not a text message, arrives when a dose is taken or
    missed, even with the app closed.
  - If a dose crosses two hours past its scheduled time with nothing marked
    taken, the server-side check (running independently of whether either
    phone has the app open) marks it missed and pushes an alert to the
    caregiver automatically.
  - The caregiver's Pills tab shows a read-only view of the patient's
    medicine list, kept in sync from the patient's phone.
  - Either side can end the pairing: the caregiver can disconnect their own
    phone (which also turns off push there), and the patient can
    permanently delete everything shared under the family code, with a
    confirm step, from their own Family tab.
- All text, fonts, contrast, and button sizes are tuned for older adults
  (large type, a font designed for low vision, big tap targets, plain short
  sentences) throughout, including the caregiver-side screens.
- **Privacy Policy, Terms of Use, and Help/FAQ pages** — see "Pages added
  for publishing" below.

## Medicine verification (official U.S. drug data)

When a bottle is photographed, the AI reads the name, strength, the NDC
(product code) and the label's pill description, then
`verifyMedicine` (`src/lib/drug-verify.ts`) checks it:

1. **NDC → exact product.** The openFDA NDC directory gives the product's
   name, strength, form and maker; its DailyMed label gives the pill's
   color, shape and imprint and, when the maker submitted one, their pill
   photo. The NDC is only trusted if it agrees with the name and strength on
   the label, since a one-digit misread can land on a different real product.
   The 11-digit billing format and undashed NDCs are handled
   (`productNdcCandidates`).
2. **Otherwise name + strength → RxNorm**, which confirms the drug exists
   in that strength (it catches "lisinopril 100 mg"). The maker is unknown
   this way, so the person takes their own pill photo.
3. If neither works, or the government services are down, the person can
   type the details and continue with a clear "ask your pharmacist" note;
   the medicine is saved as `verifiedBy: "none"`.

**The cache is keyed by product (NDC), not by drug name**, because the same
drug and strength from different makers are different-looking pills.
`drug_products` (`migrations/0003_drug_cache.sql`) holds one row per product
and the pill photo goes to R2 at `official/<sha256>.jpg`; `drug_name_lookups`
caches RxNorm answers. Nothing personal is stored. Rows refresh after 90 days
(names after 30); if a government service is down, the stale row is used.

**Refills / maker changes.** Scanning a bottle for a medicine already on the
list updates it instead of adding a duplicate, keeps its times, and says so
when the NDC shows a different maker ("your pills may look different now").

**At pill time** the Check screen shows the bottle description first — name,
strength, form and "The pill: White round tablet, marked M / 367" — with the
reference photo underneath. The pill-photo AI check also receives the
official description and knows when the reference is a maker's front/back
photo.

**Seeding the cache.** `scripts/seed-drug-cache.mjs` walks
`scripts/common-oral-medicines.txt` (a starter list, not a ranking),
finds each medicine's DailyMed labels and asks the deployed app to cache
every product on them through `POST /api/drug-cache/warm` (off unless
`DRUG_CACHE_ADMIN_TOKEN` is set). Set `OPENFDA_API_KEY` first. Seeding
is optional: every scan fills the cache anyway.

**Limits.** Not every FDA label includes a maker's pill photo; those
medicines fall back to the person's own photo with the official
description shown. The parsers are unit-tested against the documented
formats and the lookup/cache flow against mocked responses, but they have
not been run against the live government APIs from here — run one real
scan of a bottle with an NDC after deploying.

## Design choices worth knowing about

**SMS is one-tap, not automatic.** The app pre-fills the text message and
opens the phone's own Messaging app; the person taps Send. It doesn't
silently send texts from a server — that needs a paid service (e.g.
Twilio), a registered business phone number, ongoing per-message cost, and
typically the recipient's consent under carrier rules. The push
notification feature above is the "automatic" alerting path instead — it
costs nothing extra and doesn't have those requirements, which is exactly
why it was built as a phone notification rather than an auto-sent text.

**Local data stays local; paired data lives on the server.** A medicine's
photos and a patient's day-to-day schedule state live on the patient's
phone only. Once paired, only what the caregiver needs — the medicine
names/strengths/times, and each dose's taken/missed status with its
confirmation photo — is mirrored to the server so a second phone can see
it. Treat a family code like a shared link: anyone who has the exact code
can read and write that family's data (no accounts, no passwords), which
is the deliberate trade-off for zero-friction pairing. Don't put anything
more sensitive than a first name, a phone number, and pill names in it.

## Pages added for publishing

Reviewing the app for real-world publishing surfaced a gap: it had no
privacy policy, terms, help page, or friendly error page — all things an
app store (and a family trusting it with health-adjacent data) reasonably
expects. Added:

- **`/privacy`** — what's stored locally vs. shared once paired, that a
  third-party AI (xAI) reads bottle/pill photos, and how to delete
  everything. Written to accurately match what the code actually does.
- **`/terms`** — leads with a clear "this is not medical advice" notice
  (always look at the pill yourself; call your pharmacist if unsure; call
  emergency services for an emergency, not this app), plus use-at-your-own-
  risk and family-code-sharing terms.
- **`/help`** — plain-language answers to the things a first-time user or
  their family will actually ask: what a mismatch means, how pairing works,
  how to turn off alerts, camera/notification troubleshooting.
- **A friendly 404 page** — replaces the framework's generic "not found"
  with something in the app's own voice and a way back to Home.

These are linked from the Family tab (both roles) and from the very first
onboarding screen, and work as standalone pages reachable without
completing onboarding — which matters, because a store's privacy policy
link needs to resolve on its own. **The "Contact" lines in these pages have
a placeholder — add a real support email before you publish.**

## Before you submit to the Play Store

Code-level readiness (the three pages above, the data-deletion flow, and a
working PWA) is one part of publishing; the rest happens in Play Console
and isn't something I can do from here:

- **Privacy policy URL**: point the Play Console listing at your deployed
  `/privacy` page.
- **Data Safety form**: declare what `/privacy` describes — personal info
  (name, phone number), photos, and that data can be deleted in-app.
- **Support email**: same address you put in `/privacy` and `/help`.
- **Store listing assets**: icon, feature graphic, and real screenshots of
  the running app — none of this exists yet and has to be produced from an
  actual deployed build, not written as code.
- **Content rating questionnaire** and **target audience** (adults) in Play
  Console.
- **The TWA wrapper itself** (see "What this actually is" above) — a
  separate packaging step via Bubblewrap or PWABuilder once this is
  deployed to a real domain.

## My review — what I'd improve next

**Two fixed in this pass** (these were the two most directly tied to
whether the app does its actual job correctly, so they came first):

- **The "Practice" button could silently mark a future dose as really
  taken.** Home's "Practice taking this pill" card (shown for your *next*,
  not-yet-due dose) reused the exact same confirmation flow as a real dose
  — same route, same code path. Finishing it marked that future dose taken
  for real, which meant the actual reminder for it would never fire later,
  and a paired caregiver would get told a dose was taken hours before it
  actually happened. `/check` now carries an explicit `practice` flag:
  practice mode still runs the full photo-check experience, but its
  confirmation never calls `markTaken`, never syncs to the server, and
  never opens the family text — it ends with a plain "that's how it
  works, nothing was saved" screen instead.
- **Nothing stopped a dose from being confirmed twice.** Tapping "I have
  this pill" a second time for an already-taken dose (a forgotten "did I
  take this?" moment, a reminder notification tapped again, a browser
  back-button) went straight back through the same photo-check flow with
  no warning. `/check` now checks for an existing "taken" event for that
  exact medicine/date/time before anything else, and shows an "Already
  taken, at 8:03 AM — taking it again could mean too much medicine" screen
  with a deliberate second tap required to log it again anyway.
- While fixing the practice-mode issue I also found the flow had no
  confirmation screen at all when a dose was logged from the "we're not
  sure, but they match" path — tapping that button silently succeeded with
  no on-screen feedback. Folded into the same fix: there's now one shared
  "done" screen regardless of which button led there.

Everything else I noticed, still open, roughly in priority order:

1. **Real-device testing is the biggest remaining gap.** These two fixes
   are verified by typechecking and a careful trace of every path through
   the new branching logic — not by tapping through it on an actual phone,
   since this sandbox has no browser to click through an interactive flow
   with. Before trusting this with an actual elderly relative, run through
   Add → reminder → photo-check → confirm, then deliberately try to
   re-confirm the same dose and try the Practice button, on a real Android
   phone.
2. **No rate limiting yet** on the server functions — `createHousehold`,
   `getHousehold`, etc. are open endpoints. A 6-character code has ~1
   billion combinations, so guessing one isn't practical at normal traffic,
   but there's nothing today stopping automated abuse at volume. Cloudflare
   has built-in rate-limiting rules that would cover this without touching
   the app code.
3. **Confirmation photos accumulate forever.** `dose_events.check_image`
   has no retention/cleanup — fine for an MVP, but worth adding a "delete
   photos older than N days" step to the missed-dose task (or a separate
   scheduled task) before this sees months of real use.
4. **Time zones aren't handled.** Schedule times are plain "HH:mm" strings
   with no time zone attached — a patient traveling across zones would see
   reminders drift. Not a problem for the common case (one phone, one
   time zone), worth a look if that's a real scenario for your users.
5. **No delivery confirmation on the push side.** The patient can see "✓
   Family texted" for SMS, but nothing tells them a push notification
   actually reached the caregiver's phone (Web Push doesn't have a
   built-in delivery receipt). Minor, but worth knowing it's a one-way,
   best-effort signal.

## What I could not verify myself

I built and typechecked all of this, ran the household-pairing,
activity-feed, and push-subscribe server logic end-to-end against a real
database in a local sandbox, and ran `wrangler deploy --dry-run` against the
build output — that confirmed the whole bundle is valid and deployable
(2.27 MB total, 486 KB gzipped, well under Cloudflare's limits) without
needing a Cloudflare account. What I genuinely could **not** test, because
my sandbox can't reach Cloudflare's API or a real push service, and has no
browser to click through an interactive flow with:

- An actual `wrangler deploy` to your Cloudflare account (the dry run
  validates everything up to that point; the real deploy just needs your
  login and secrets).
- Whether a push notification actually arrives on a real phone.
- That the Cron Trigger fires on schedule once deployed (it's generated
  correctly in the build output — confirmed — but I can't watch it fire).
- The two fixes above, and everything else UI-side, by actually tapping
  through it — see point 1 just above.

After your first deploy, it's worth: sending yourself a test dose (mark one
taken from the patient side) and confirming the caregiver phone gets the
notification, and checking Cloudflare dashboard → Workers → your app →
Triggers to confirm the cron trigger is listed.

## Known limits of this MVP (by design, not oversight)

- No accounts or passwords, on either side — see the "family code" trade-off
  above.
- A caregiver only sees dose *activity*, not the full medicine detail (no
  photos of the pills themselves, no editing) — keeps what's shared to the
  minimum needed for peace of mind.
- The Privacy/Terms/Help pages are accurate, plain-language drafts written
  to match the actual code, not lawyer-reviewed legal documents — see "My
  review" above and the note on each page.
