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

- **WhatsApp → web chat, still, for the live demo** — same as before, but
  worth being precise about why. `apps/server/src/whatsapp.ts` is a real,
  deployed Twilio WhatsApp webhook (see below): it receives real inbound
  WhatsApp messages, runs the real `HouseholdService` conversation state
  machine, and was verified live end-to-end during development. What
  doesn't work on Twilio's **free trial** specifically is the *reply*: their
  trial account requires every outbound message (including replies to an
  inbound one) to use a pre-approved Content Template, and the Content API
  needed to even list those templates is itself locked behind a paid
  upgrade ("This feature is not available on a Trial account" — confirmed
  live against this account). So inbound WhatsApp messages update real
  household state, but dynamic reply text (the actual plan, tariff figures,
  Q&A answers) can't go back out without either paying to leave Twilio's
  trial or rebuilding on Meta's Cloud API instead — both out of scope for
  this round. `apps/web/src/Chat.tsx` is the fully-working WhatsApp-style
  channel used for the demo.
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

## The Twilio WhatsApp webhook (built, reachable, replies blocked on trial)

`apps/server/src/whatsapp.ts` + the `POST /whatsapp/webhook` route is a real
integration, not a mock — it runs the exact same onboarding → daily plan →
ask-anything → DONE → OUTAGE state machine as `Chat.tsx`, driven by inbound
WhatsApp text instead of button taps, and is live at
`https://bijli-server-production.up.railway.app/whatsapp/webhook`.

What's confirmed working, tested against a real Twilio trial account:
- Twilio → our webhook: inbound messages arrive, get parsed (`From`, `Body`,
  `MediaUrl0` for bill photos), and correctly update real household state.
- Our webhook → Twilio: replies go out via the REST Messages API (not a
  TwiML webhook response — Twilio's current trial flow silently drops
  that), using the inbound request's own `To` as our `From`.

What's blocked, specifically on Twilio's **free trial** tier: sending the
*reply itself* fails with `21654 ContentSid Required` — trial accounts must
use a pre-approved Content Template for every outbound message, and the
Content API to inspect or pick one is itself paywalled ("not available on a
Trial account"). This is a platform restriction, not a bug here; it lifts
the moment the Twilio account is upgraded off trial (standard WhatsApp
session-message rules apply to paid accounts — freeform replies within 24h
of an inbound message need no template). Until then, `Chat.tsx` is the
channel used for demos.

To pick this back up later: `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` env
vars on `bijli-server` are already set. Either add billing to the Twilio
account (small pay-as-you-go cost per message, no subscription), or port
`sendWhatsAppMessage`/`handleIncomingWhatsApp` in `whatsapp.ts` to Meta's
WhatsApp Cloud API instead, which allows freeform replies to up to 5
manually-registered test numbers with no template and no card. Either way,
the webhook route, conversation state machine, and inbound parsing in
`whatsapp.ts` stay as-is — only the outbound send call changes.

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
