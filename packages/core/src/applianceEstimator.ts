import { APPLIANCE_RATINGS, EV_ENERGY_PER_KM } from "@bijli/data";
import type { ApplianceEntry, ApplianceShare, Bill } from "@bijli/domain";

function rawMonthlyKWh(entry: ApplianceEntry): number {
  if ((entry.type === "ev_scooter" || entry.type === "ev_car") && entry.ev) {
    const perKm = EV_ENERGY_PER_KM[entry.ev.vehicleType];
    return entry.ev.dailyKm * perKm * 30;
  }
  const rating = APPLIANCE_RATINGS[entry.type];
  return (rating.ratedPowerWatts / 1000) * rating.typicalDailyHours * rating.usageFactor * 30;
}

/**
 * Rated power x hours x usage factor, scaled to match the household's real
 * bill total. Pure arithmetic -- no LLM involved, per the "calculator writes
 * the numbers" rule.
 */
export function estimateApplianceShares(appliances: ApplianceEntry[], bill: Bill | undefined): ApplianceShare[] {
  const present = appliances.filter((a) => a.present);
  if (present.length === 0) return [];

  const rawByAppliance = present.map((a) => ({ entry: a, raw: rawMonthlyKWh(a) }));
  const rawTotal = rawByAppliance.reduce((sum, r) => sum + r.raw, 0);
  const billUnits = bill?.unitsKWh && bill.unitsKWh > 0 ? bill.unitsKWh : rawTotal;
  const scaleFactor = rawTotal > 0 ? billUnits / rawTotal : 1;

  return rawByAppliance.map(({ entry, raw }) => {
    const scaledKWh = raw * scaleFactor;
    const sharePercent = billUnits > 0 ? (scaledKWh / billUnits) * 100 : 0;
    return {
      type: entry.type,
      shareOfBillPercent: [round1(sharePercent * 0.85), round1(sharePercent * 1.15)],
      estKWhPerMonth: [round1(scaledKWh * 0.85), round1(scaledKWh * 1.15)],
      label: "estimated",
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
