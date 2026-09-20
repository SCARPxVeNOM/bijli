# BijliSaathi

**The cheapest power plant India can build is 8 pm usage moved to 1 pm.**

BijliSaathi is a WhatsApp-style assistant that gives an Indian household one
short, personal message a day: which appliance to shift, to which hour, and
how much it saves — built from the family's own electricity bill, real
tariff rules, and real weather and grid data.

**Live demo:** https://bijli-web-production.up.railway.app
**API:** https://bijli-server-production.up.railway.app/health

## The problem

India has enough electricity on paper, yet families lose power on hot
evenings and pay the most for it then — because supply is sufficient in
total but strained locally, at exactly the hours homes need it most.

| Fact (2026) | Figure |
| --- | --- |
| Peak demand met | 270.8 GW, May 2026 |
| Energy shortage, nationally | Zero, FY 2025-26 |
| Coal share in non-solar peak hours | ~75% |
| Evening peak deficit, May heatwave | ~2.57 GW |
| Night outages reported | 40–60 min cuts (parts of Chennai); complaints in Delhi, Noida, Odisha |

*Source: Energetica India, Grid-India via Reuters.*

It's a **timing** problem, not a total-supply problem. Solar floods the grid
at midday; coal carries the evening. India's own Time-of-Day electricity
rules already pay for shifting — solar hours must be 10–20% cheaper, peak
hours 10–20% dearer — but almost nobody knows their cheap hours exist, or
what to move into them. That's the gap BijliSaathi closes.

## What it does

A family goes from "Hi" to their first personal plan in under two minutes,
no app install. After that, at most two messages a day.

> **Tomorrow — cheap hours 12:00–15:00**
> 1. Scooter: charge on rooftop solar → saves ₹5
> 2. Air conditioner: pre-cool before the 17:00 peak → saves ₹11
>
> Tonight: cut risk **medium**, 17:00–24:00.
> Reply DONE after each, or ask me anything.

The EV/e-scooter is the hero feature — the largest, most flexible load in a
home, and the one most worth moving off the evening peak.

## Why it's credible, not just another tips app

- **Real data, honestly labelled.** Every number on screen carries a badge —
  `REAL`, `ESTIMATED`, `MODELLED`, `USER-REPORTED`, or `PROJECTION`. Judges
  forgive estimates; fake precision is what loses trust.
- **The calculator writes numbers; the model writes words.** The AI (Google
  Gemini) never invents a rupee figure, a time window, or a risk level — it
  only phrases numbers a deterministic pipeline already computed.
- **Sourced tariffs, not placeholders.** Maharashtra (MSEDCL) and Delhi
  (BSES/DERC) rates are real, cited Time-of-Day orders.
- **Live weather and grid signals**, not a static rulebook — the plan
  changes with tomorrow's forecast.

## Core features

| # | Feature | What it does |
| --- | --- | --- |
| 1 | Onboarding | Language, pincode, appliances — under two minutes |
| 2 | Bill reader | Reads a real bill photo (units, amount, tariff, meter type); user confirms |
| 3 | Spending breakdown | Which appliance is driving the bill, as an honest range |
| 4 | Cheap & clean hours | Tomorrow's best window, from real tariff rules + weather |
| 5 | Cut-risk alert | Tonight's outage risk — low/medium/high, with a reason |
| 6 | Daily shift plan | Top actions, ranked by rupees saved |
| 7 | Ask anytime | "Can I run the AC now?" — answered with a reason, grounded in the plan |
| 8 | Savings tracker | Rupees saved, kWh moved, CO₂ avoided — as logged |
| 9 | Public impact counter | Every household's shift, and what it means at national scale |

**Plus all 7 stretch features**, built and verified working: live outage
map, Society/RWA mode with staggered EV charging (authorized with Cedar
policies), smart-meter data import, real Gemini-generated voice notes,
rooftop-solar-aware plans, a live-smart-plug receiver, and an opt-in
Strands Agents Q&A path.

## Architecture

```
Family on WhatsApp/web  →  Chat handler  →  Gemini (bill reading, message writing, Q&A)
                                ↓
                    Household, plan & shift-log store
                                ↑
   Scheduler  →  Daily pipeline: fetch grid + weather → forecast → risk → plan
```

Two parallel builds share the same business logic:

- **Deployed today, live on Railway** — the product above, running on real
  Google Gemini (free tier).
- **The spec's full AWS architecture** (API Gateway, Lambda, Step
  Functions, DynamoDB, EventBridge, Cedar) — built and verified end-to-end
  against LocalStack, so it runs with no AWS account or bill. See
  `infra/README.md`.

Full technical detail, run instructions, and an honest list of what's
simplified vs. the spec: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Vision

Millions of homes moving a little load, together, is how India gets through
its evening peak — the same idea, scaling from one family to apartment
societies to a DISCOM demand-response channel that pays households instead
of buying costly evening power.

Full product spec: `BijliSaathi — Hackathon Product Spec.pdf`.
