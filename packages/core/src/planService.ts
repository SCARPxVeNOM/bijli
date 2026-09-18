import { APPLIANCE_RATINGS, computeEffectiveRates } from "@bijli/data";
import type { TariffPlan } from "@bijli/data";
import type { ApplianceEntry, ApplianceShare, CheapWindow, PlanAction } from "@bijli/domain";
import { planEvCharging } from "./evPlanner.js";

function dailyKWhFor(entry: ApplianceEntry, shares: ApplianceShare[]): number {
  const share = shares.find((s) => s.type === entry.type);
  if (share) return (share.estKWhPerMonth[0] + share.estKWhPerMonth[1]) / 2 / 30;
  const rating = APPLIANCE_RATINGS[entry.type];
  return (rating.ratedPowerWatts / 1000) * rating.typicalDailyHours * rating.usageFactor;
}

/**
 * Builds one candidate PlanAction per shiftable appliance the household owns,
 * then ranks by rupees saved (a proxy for the spec's
 * "shiftable kWh x (peak price - cheap price), plus a peak-relief weight")
 * and keeps the top three. Pure arithmetic -- the message writer only phrases
 * what this function decides.
 */
export function buildDailyPlan(
  appliances: ApplianceEntry[],
  shares: ApplianceShare[],
  tariff: TariffPlan,
  cheapWindow: CheapWindow,
  rooftopSolarKw?: number
): PlanAction[] {
  const { normalRate, peakRate, solarRate } = computeEffectiveRates(tariff);

  const candidates: PlanAction[] = [];

  for (const entry of appliances.filter((a) => a.present)) {
    const rating = APPLIANCE_RATINGS[entry.type];

    if (entry.type === "ev_scooter" || entry.type === "ev_car") {
      const action = planEvCharging(entry, tariff, cheapWindow, rooftopSolarKw);
      if (action) candidates.push(action);
      continue;
    }

    if (rating.shiftability === "no") continue;

    const dailyKWh = dailyKWhFor(entry, shares);

    if (rating.shiftability === "yes") {
      // Rooftop-solar homes (stretch #6): if the panel covers this appliance's
      // draw, running it in the solar window is free, not just ToD-cheap.
      const ownSolarCoversIt = (rooftopSolarKw ?? 0) * 1000 >= rating.ratedPowerWatts;
      const savings = dailyKWh * (peakRate - (ownSolarCoversIt ? 0 : solarRate));
      candidates.push({
        applianceType: entry.type,
        action: ownSolarCoversIt
          ? `${rating.displayName}: run ${cheapWindow.startHour}:00-${cheapWindow.endHour}:00 on your own rooftop solar, free`
          : `${rating.displayName}: run ${cheapWindow.startHour}:00-${cheapWindow.endHour}:00, in the cheap window`,
        windowStartHour: cheapWindow.startHour,
        windowEndHour: cheapWindow.endHour,
        estSavingsRupees: Math.round(savings),
        estKWh: Math.round(dailyKWh * 10) / 10,
        label: "estimated",
        isGreen: true,
      });
      continue;
    }

    // "partly" shiftable: geyser, AC -- assume ~40% of the load can move out
    // of the peak window, avoiding the surcharge rather than reaching the
    // full solar discount.
    const shiftableFraction = 0.4;
    const savings = dailyKWh * shiftableFraction * (peakRate - normalRate);
    const preWindowStart = Math.max(tariff.peakWindow.startHour - 1, 0);
    candidates.push({
      applianceType: entry.type,
      action: `${rating.displayName}: ${entry.type === "ac" ? "pre-cool before" : "heat just before"} the ${tariff.peakWindow.startHour}:00 peak, then ease off during it`,
      windowStartHour: preWindowStart,
      windowEndHour: tariff.peakWindow.startHour,
      estSavingsRupees: Math.round(savings),
      estKWh: Math.round(dailyKWh * shiftableFraction * 10) / 10,
      label: "estimated",
      isGreen: entry.type !== "ac",
    });
  }

  return candidates.sort((a, b) => b.estSavingsRupees - a.estSavingsRupees).slice(0, 3);
}
