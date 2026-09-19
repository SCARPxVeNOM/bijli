# BijliSaathi

A WhatsApp-style assistant that sends an Indian household one daily plan: which
appliance to shift, to which hour, and how much it saves. Full product spec:
`BijliSaathi — Hackathon Product Spec.pdf`.

**Live demo:**
- Web app: https://bijli-web-production.up.railway.app
- API: https://bijli-server-production.up.railway.app (`/health`, `/api/...`)

## Three ways this runs

1. **Local prototype** (`apps/server` + `apps/web`) — Express API + a
   JSON-file store + a Vite/React web chat standing in for WhatsApp. No AWS
   account or WhatsApp Business approval needed.
2. **Deployed on Railway** — the exact same code as (1), as two live
   Railway services, using the real Google Gemini API (free tier) for bill
   reading, message writing, and Q&A.
3. **The spec's real AWS architecture, via SAM CLI + LocalStack**
   (`infra/`) — API Gateway, Lambda, Step Functions, DynamoDB, EventBridge,
   S3, running on your machine with no AWS account, card, or bill. **Not
   public** — bound to `localhost:4566`, with no URL reachable from another
   machine. See `infra/README.md`.

All three share `packages/core`'s business logic untouched; only the store
(`JsonDb` vs `DynamoDbStore`) and transport (raw HTTP vs API Gateway) differ.

## Quick start (local)

```bash
npm install
cp apps/server/.env.example apps/server/.env   # add GEMINI_API_KEY to use a real LLM
cp apps/web/.env.example apps/web/.env
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:5173
```

Open http://localhost:5173, hit "Say Hi", and walk through onboarding
(language → pincode → bill photo/manual entry → appliances → EV details if
you own one). You land on your first plan; use the chat's DONE/Ask/Power's
out/Run pipeline now controls, then check the **Dashboard** and **Impact**
tabs.

No network access needed: weather falls back to a deterministic synthetic
forecast (clearly labelled) if it can't reach Open-Meteo, and the LLM falls
back to a template-based mock if no API key is set.

**Note:** if you edit `packages/domain`, `packages/data`, or `packages/core`
while `npm run dev:server` is running, restart it (`npm run dev:server`
again) to pick up the change — those packages resolve to their built `dist/`
output (needed for the Railway/production `node dist/index.js` start
command to work at all), not their live TypeScript source.

## Repo layout

```
packages/domain   shared TypeScript types (Household, Bill, DailyPlan, ...)
packages/data     static reference data: ToD tariffs, appliance ratings,
                  national grid facts, a small pincode lookup
packages/core     the calculators + services (see below)
apps/server       Express API + JSON-file "DB" + daily-pipeline cron
apps/web          Vite/React app: WhatsApp-style chat, dashboard, impact page
infra/            SAM template + Lambda handlers, for the LocalStack track
.railway/         Railway "Infrastructure as Code" config (railway.ts)
```

### `packages/core`, mapped to the spec's 9 features

| File | Feature |
| --- | --- |
| `householdService.ts` | Onboarding orchestration (#1), daily pipeline |
| `weather.ts` | Real Open-Meteo forecast (feeds #4, #5) |
| `applianceEstimator.ts` | Appliance spending breakdown (#3), real smart-meter readings when present |
| `cheapHours.ts` | Cheap & clean hours (#4) |
| `riskService.ts` | Cut-risk alert (#5) |
| `evPlanner.ts` + `planService.ts` | Daily shift plan + EV module (#6), rooftop-solar self-consumption |
| `llm/*` | Bill reader (#2), message writer, ask-anytime (#7), voice-note TTS |
| `savings.ts` | Savings/impact tracker + public counter (#8, #9) |
| `db.ts` / `dynamoDbStore.ts` | The `Store` interface, and its two implementations |
| `backtest.ts` | The May 2026 heatwave backtest, run through the real pipeline |
| `societyService.ts` | Society/RWA mode: staggered EV charging under a shared load limit |
| `authorization.ts` | Cedar policies gating the society routes |

### All 7 stretch features, and what's real about each

| # | Stretch feature | Status |
| --- | --- | --- |
| 1 | "Power's out" reports + live map | Built. Real reports, real pincode lat/lon, plotted on a plain grid (not a fabricated India outline) — `OutageMap.tsx`, `GET /api/outages` |
| 2 | Live-metered smart plug | Software receiver only (no hardware here) — `POST /households/:id/smart-plug/reading`, a Dashboard tile. Untested end-to-end without a real device |
| 3 | Society / RWA mode | Built. Real greedy scheduler staggers member EV charging under a shared kW limit — `societyService.ts`, `Society.tsx` |
| 4 | Smart meter data import | Built. Daily (or per-appliance) readings replace the rated-power estimate, flip to `real` — `POST /households/:id/smart-meter`, Dashboard CSV upload |
| 5 | Voice notes | Built with real Gemini TTS (`gemini-2.5-flash-preview-tts`, wrapped as a playable WAV) — `POST /households/:id/plan/speech`, the Chat's 🔊 Listen button |
| 6 | Rooftop-solar homes | Built. Panel capacity reframes in-window appliance/EV actions as free self-consumption — the Chat's appliances step |
| 7 | Strands agent + Cedar | Both built. Cedar (`@cedar-policy/cedar-wasm`) gates the Society routes for real; Strands (`@strands-agents/sdk`, TypeScript preview) is an opt-in alternate ask-anytime agent behind `STRANDS_QA=true`, tool-calling real Gemini — falls back to the direct call on any error, since the SDK is explicitly experimental |

**The one rule the code follows throughout:** the calculator writes numbers
(`planService`, `riskService`, `cheapHours`, `evPlanner`), the LLM only
phrases them (`llm/mockProvider.ts`, `llm/geminiProvider.ts`,
`llm/anthropicProvider.ts`). No LLM call anywhere is allowed to invent a
rupee figure, a time window, or a risk level — they're always passed in as
already-decided data.

**Data labels.** Every number carries a `DataLabel`
(`real` / `estimated` / `user-reported` / `projection` / `modelled`), per the
spec's "judges forgive estimates, they punish fake precision" rule. The
dashboard and impact page render these as coloured badges.

### Real tariff data

`packages/data/tariffs.ts` now carries **sourced, real numbers**, not
placeholders: MSEDCL's (Maharashtra) actual FY 2025-26 solar-hours rebate
(₹0.80/kWh, 9am–5pm) and peak surcharge (20%, 5pm–midnight), and BSES/DERC's
(Delhi) real slab rates and ToD rule (solar ≥20% cheaper, peak ≥10% dearer).
Both cite their source in the file. The one honest simplification kept:
Indian domestic billing is telescopic (multiple slabs), and this uses the
marginal rate at the typical urban household's slab rather than a full bill
reconstruction — called out in a comment, not hidden.

- `packages/data/pincodes.ts` — extend with your demo pincodes.
- `packages/data/gridFacts.ts` — the national figures are the spec's own
  cited numbers (Energetica India / Reuters); the May 2026 heatwave backtest
  scenario there is what the "proof" demo slide should replay.

### Real LLM instead of the mock

`getLLMProvider()` (`packages/core/src/llm/index.ts`) picks a provider by
env var, preferring the one with a key set:

1. `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`, default `gemini-3.6-flash`)
   — Google's free-tier API. This is what the Railway deployment runs on.
2. `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) — no free tier, but
   supported since the spec explicitly allows swapping Bedrock for another
   model.
3. Neither set → the offline template-based mock.

Set `LLM_PROVIDER=gemini|anthropic|mock` to force a choice. All three
implement the identical `readBill` / `writeDailyMessage` / `answerQuestion`
contract, so switching providers never touches `planService`, `riskService`,
or any route.

Two more, both opt-in:

- **Voice notes**: Gemini only, real TTS (`GEMINI_TTS_MODEL`, default
  `gemini-2.5-flash-preview-tts`). Mock/Anthropic don't implement
  `synthesizeSpeech`, so the route returns 501 and the Chat's Listen button
  simply doesn't render — never fake audio.
- **`STRANDS_QA=true`**: routes ask-anytime through AWS's Strands Agents SDK
  (TypeScript preview) instead of the direct Gemini call, giving the agent
  explicit `lookupPlan`/`lookupTariff` tools. Falls back to the direct call
  automatically on any error, since the SDK is experimental — never the
  default.

## Cold starts

Only a real concern for the Lambda track (`infra/`), not Railway (a
long-running container). `infra/template.yaml`'s `ApiFunction` has an
EventBridge `Schedule` event pinging it directly every 5 minutes; the
handler (`infra/src/api.ts`) detects that direct ping and returns
immediately, without touching Express or DynamoDB. This is a demo-time
mitigation — the real production answer on actual AWS is Provisioned
Concurrency, noted in `infra/README.md` rather than built (it isn't
meaningfully testable against LocalStack).

## What's simplified vs. the full spec

- **Real WhatsApp, via Twilio's free trial** (see below) — not a
  simulation. `apps/web/src/Chat.tsx` still exists as a second, buttons-based
  channel for demoing without a phone in hand; both talk to the same
  `HouseholdService`.
  - Confirmed risk from the spec: Meta's own WhatsApp Cloud API needs
    business verification and caps unverified numbers at 5 recipients.
    Twilio's older open-join Sandbox avoided that entirely, but Twilio has
    since replaced it with a stricter trial flow that carries the *same*
    5-verified-recipient cap — so for now, either path needs each demo
    phone (yours, a backup phone) pre-verified in the console first, a
    30-second step. The upside kept: Twilio's setup is still faster (no
    business-verification wait) and the webhook/conversation code is
    identical either way, so upgrading to a paid Twilio number later, or
    Meta's Cloud API, is a config change, not a rewrite.
- **DynamoDB → JSON file (Railway) / real DynamoDB (infra/LocalStack).**
  `packages/core/src/db.ts` defines the `Store` interface; `JsonDb`
  implements it for Railway, `DynamoDbStore` implements it for `infra/`.
  `HouseholdService` depends only on the interface.
- **EventBridge + Step Functions.** Simulated with `node-cron` on Railway;
  actually built with real Step Functions + EventBridge in `infra/` (see
  `infra/README.md`). Every household also has a "Run pipeline now" button
  for demos.
- **Chronos demand forecasting → a simple heat-based rule.** The spec's own
  guidance: "if the simple baseline wins, say so." `riskService.ts` is that
  honest baseline; Chronos is a stretch upgrade, not a dependency.
- **Cut-risk alert & evening plan → one combined message.** The spec sends
  these as two separate daily messages; this build merges them into one
  `DailyPlan` (with `cutRisk` as its own labelled field) to keep the pipeline
  simple.
- **Weekly savings report → always-on dashboard.** Instead of a scheduled
  weekly message, `/households/:id/savings` is queryable anytime.
- **All 7 stretch features are built** (see the table above) — the only
  gap is the live-metered smart plug's *hardware side*, since there's no
  physical smart plug attached to this machine; its software receiver
  endpoint is real and ready.
- **Backup video** is the one explicit exclusion from this round, at the
  user's request.

## Real WhatsApp, in 5 minutes (Twilio trial)

`apps/server/src/whatsapp.ts` + the `POST /whatsapp/webhook` route is a real
WhatsApp bot, not the `Chat.tsx` simulation — it runs the exact same
onboarding → daily plan → ask-anything → DONE → OUTAGE flow as text messages.
Replies go out via Twilio's REST Messages API (not a TwiML webhook response —
Twilio's current trial flow doesn't honor that), so `TWILIO_ACCOUNT_SID` and
`TWILIO_AUTH_TOKEN` are required for any reply, not just bill photos.

1. Sign up free at [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
   (no credit card). In the Console: **Messaging → Try it out → Send a
   WhatsApp message**. Your own signup number is auto-verified; verify up to
   4 more (e.g. a backup demo phone) from the same screen — each just needs
   an OTP typed in, no approval wait.
2. Send the prepopulated `join <code>` message (or scan the QR code) from
   each verified phone to activate WhatsApp for that number.
3. On that page, under **Inbound → Auto-Reply settings**, choose **Custom**
   and set the webhook to `https://<your-railway-server-url>/whatsapp/webhook`
   (POST). Railway already gives you a public HTTPS URL, so no ngrok/tunnel
   is needed once deployed.
4. Text "Hi" from a verified phone. You'll get the real onboarding flow.

Two more env vars on `bijli-server` unlock more:
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (required, see above) — also
  lets the bot download bill *photos* (Twilio's media URLs are Basic-Auth
  protected); without them set, inbound messages still update household
  state, they just get no reply and no photo support.
- `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (your trial number) — lets
  the existing 6pm `node-cron` job (`apps/server/src/index.ts`) proactively
  push each household's plan out over WhatsApp, not just generate it
  (replies to an inbound message don't need this — they reuse the number
  the inbound message arrived on).

Known trial limitations (all lifted once you upgrade the Twilio account or
move to a real WhatsApp Business Account, unrelated to this codebase): only
up to 5 verified phones can receive messages at all, every recipient must
send "join" once first, sessions expire after 24h of inactivity, and Twilio
prefixes a one-time trial disclaimer on the first reply. For a live demo,
pre-verify your own phone and a backup phone in advance rather than relying
on a judge's unregistered number.

## Deploying to Railway

Already deployed (see the live URLs above). To redeploy or understand the
setup: `.railway/railway.ts` is the source of truth (Railway's
"Infrastructure as Code" format — the older `railway.json` config-as-code
format is deprecated). It defines two services, `bijli-server` and
`bijli-web`, each with their `build`/`start` commands. Root `package.json`
scripts `build:server` / `build:web` are what those commands call.

```bash
railway login
railway config plan   # preview
railway config apply  # apply build/start commands to both services
railway up --service bijli-server --detach
railway domain --service bijli-server           # get its public URL once
railway variable set VITE_API_URL=<that URL>/api --service bijli-web --skip-deploys
railway up --service bijli-web --detach
railway domain --service bijli-web
```

`VITE_API_URL` must be set on `bijli-web` *before* it builds (Vite bakes
`import.meta.env` in at build time), so `bijli-server` has to deploy first.
`GEMINI_API_KEY` is set on `bijli-server` the same way (`railway variable
set`, or via stdin so the raw key never appears in shell history:
`echo "$KEY" | railway variable set GEMINI_API_KEY --stdin --service bijli-server`).

## The SAM CLI + LocalStack track

See `infra/README.md`. Short version: `./infra/deploy-local.sh` stands up
the spec's real AWS architecture against LocalStack, verified end-to-end —
onboarding through the API Gateway URL, and a full Step Functions execution
that writes a plan into DynamoDB.

## Path to real AWS (beyond LocalStack)

`infra/template.yaml` already *is* the real AWS architecture; deploying it
for real needs your AWS account, Bedrock model access (or keep using
Gemini/Anthropic directly), and a WhatsApp Business Account (or the
Telegram/web-chat fallback the spec suggests if that approval is slow).
Concretely: drop `AWS_ENDPOINT_URL` from the template's `Globals`, and
`sam deploy` instead of `samlocal deploy`. Nothing else changes — the
Lambda code, DynamoDB schema, and Step Functions definition are already the
real thing.
