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
   S3, running on your machine with no AWS account, card, or bill. See
   `infra/README.md`.

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
| `applianceEstimator.ts` | Appliance spending breakdown (#3) |
| `cheapHours.ts` | Cheap & clean hours (#4) |
| `riskService.ts` | Cut-risk alert (#5) |
| `evPlanner.ts` + `planService.ts` | Daily shift plan + EV module (#6) |
| `llm/*` | Bill reader (#2), message writer, ask-anytime (#7) |
| `savings.ts` | Savings/impact tracker + public counter (#8, #9) |
| `db.ts` / `dynamoDbStore.ts` | The `Store` interface, and its two implementations |

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

### Swapping in real data before a demo

- `packages/data/tariffs.ts` — the ToD hours/rates are **illustrative
  placeholders** inside the legal ToD band. Replace with your demo state's
  verified tariff order and flip `label` to `"real"`.
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

## What's simplified vs. the full spec

- **WhatsApp → web chat.** `apps/web/src/Chat.tsx` mimics WhatsApp's
  interactive buttons/lists; swapping in AWS End User Messaging later means
  replacing this UI with real webhook handling, not touching `core`.
  - Confirmed risk from the spec: WhatsApp Business verification is slow.
    This build sidesteps it entirely.
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
- **Stretch features not built:** society/RWA mode, live-metered smart plug,
  smart-meter import, voice notes, rooftop-solar plans, Strands Agents SDK,
  Cedar. The "power's out" report + impact counter (the highest-priority
  stretch items) *are* built.

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
