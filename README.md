# BijliSaathi

A WhatsApp-style assistant that sends an Indian household one daily plan: which
appliance to shift, to which hour, and how much it saves. Full product spec:
`BijliSaathi — Hackathon Product Spec.pdf`.

This repo is **Stage 1** of a two-stage build:

1. **This local prototype** — runs entirely on your laptop, no AWS account or
   WhatsApp Business approval required. A web chat stands in for WhatsApp; a
   pluggable LLM interface defaults to an offline rule-based mock and upgrades
   to the real Anthropic API with one env var.
2. **Real AWS deployment** (not built yet) — the actual architecture from the
   spec: Lambda, Step Functions, DynamoDB, EventBridge, Bedrock, Amplify, AWS
   End User Messaging for WhatsApp. See "Moving to Stage 2" below.

## Quick start

```bash
npm install
cp apps/server/.env.example apps/server/.env
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
back to a template-based mock if `ANTHROPIC_API_KEY` isn't set.

## Repo layout

```
packages/domain   shared TypeScript types (Household, Bill, DailyPlan, ...)
packages/data     static reference data: ToD tariffs, appliance ratings,
                  national grid facts, a small pincode lookup
packages/core     the calculators + services (see below)
apps/server       Express API + JSON-file "DB" + daily-pipeline cron
apps/web          Vite/React app: WhatsApp-style chat, dashboard, impact page
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

**The one rule the code follows throughout:** the calculator writes numbers
(`planService`, `riskService`, `cheapHours`, `evPlanner`), the LLM only
phrases them (`llm/mockProvider.ts`, `llm/anthropicProvider.ts`). No LLM call
anywhere is allowed to invent a rupee figure, a time window, or a risk level —
they're always passed in as already-decided data.

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

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) in
`apps/server/.env`. `getLLMProvider()` in `packages/core/src/llm/index.ts`
then returns `AnthropicLLMProvider`, which does real bill-photo reading
(Claude vision) and real message writing/Q&A, using the exact same
plan-numbers-in, words-out contract the mock uses. This is a legitimate
stand-in for the spec's Bedrock calls — no AWS account needed for it.

## What's simplified vs. the full spec

- **WhatsApp → web chat.** `apps/web/src/Chat.tsx` mimics WhatsApp's
  interactive buttons/lists; swapping in AWS End User Messaging later means
  replacing this UI with real webhook handling, not touching `core`.
  - Confirmed risk from the spec: WhatsApp Business verification is slow.
    This build sidesteps it entirely for Stage 1.
- **DynamoDB → JSON file.** `packages/core/src/db.ts` is a drop-in-shaped
  stand-in (`households` / `plans` / `shiftLogs` / `outageReports`) so
  porting to the real DynamoDB client later only touches that one file.
- **EventBridge + Step Functions → `node-cron` + a manual endpoint.**
  `apps/server/src/index.ts` schedules `generateDailyPlan` once a day; every
  household also has a "Run pipeline now" button for demos.
- **Chronos demand forecasting → a simple heat-based rule.** The spec's own
  guidance: "if the simple baseline wins, say so." `riskService.ts` is that
  honest baseline; Chronos is a stretch upgrade, not a dependency.
- **Cut-risk alert & evening plan → one combined message.** The spec sends
  these as two separate daily messages; this build merges them into one
  `DailyPlan` (with `cutRisk` as its own labelled field) to keep the pipeline
  simple. Splitting them into two cron triggers later is a small change to
  `apps/server/src/index.ts`.
- **Weekly savings report → always-on dashboard.** Instead of a scheduled
  weekly message, `/households/:id/savings` is queryable anytime.
- **Stretch features not built:** society/RWA mode, live-metered smart plug,
  smart-meter import, voice notes, rooftop-solar plans, Strands/Cedar. The
  "power's out" report + impact counter (the highest-priority stretch items)
  *are* built.

## Moving to Stage 2 (real AWS deployment)

Not started — needs your AWS account, Bedrock model access, and a WhatsApp
Business Account (or the Telegram/web-chat fallback the spec suggests if that
approval is slow). When ready, the natural mapping is:

| This repo | AWS service |
| --- | --- |
| `apps/server` Express routes | API Gateway + Lambda |
| `packages/core/src/db.ts` | DynamoDB |
| `node-cron` schedule | EventBridge Scheduler + Step Functions |
| `llm/anthropicProvider.ts` | Bedrock (swap the SDK client, keep the prompts) |
| `apps/web` | Amplify Hosting |
| Chat.tsx's webhook-shaped calls | AWS End User Messaging (WhatsApp) |

Recommended order: get WhatsApp Business (or its fallback) approved first —
it's the slowest, highest-risk step — while the Lambda/Step
Functions/DynamoDB port can happen in parallel since it's a fairly mechanical
rewrite of `householdService.ts`'s orchestration.
