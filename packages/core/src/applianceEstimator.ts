import { APPLIANCE_RATINGS, EV_ENERGY_PER_KM } from "@bijli/data";
import type { ApplianceEntry, ApplianceShare, Bill, SmartMeterReading } from "@bijli/domain";

function rawMonthlyKWh(entry: ApplianceEntry): number {
  if ((entry.type === "ev_scooter" || entry.type === "ev_car") && entry.ev) {
    const perKm = EV_ENERGY_PER_KM[entry.ev.vehicleType];
    return entry.ev.dailyKm * perKm * 30;
  }
  const rating = APPLIANCE_RATINGS[entry.type];
  return (rating.ratedPowerWatts / 1000) * rating.typicalDailyHours * rating.usageFactor * 30;
}

function averageDailyKWh(readings: SmartMeterReading[]): number {
  return readings.reduce((sum, r) => sum + r.kWh, 0) / readings.length;
}

/**
 * Rated power x hours x usage factor, scaled to match the household's real
 * bill total. Pure arithmetic -- no LLM involved, per the "calculator writes
 * the numbers" rule.
 *
 * Smart meter readings (stretch #4), when present, replace the appliance
 * estimate per the spec: whole-house daily readings become the real scaling
 * anchor (tighter than a possibly-stale bill total); any readings tagged
 * with a specific appliance replace that appliance's estimate outright with
 * an exact real figure, label "real", no range.
 */
export function estimateApplianceShares(
  appliances: ApplianceEntry[],
  bill: Bill | undefined,
  smartMeterReadings?: SmartMeterReading[]
): ApplianceShare[] {
  const present = appliances.filter((a) => a.present);
  if (present.length === 0) return [];

  const wholeHouseReadings = (smartMeterReadings ?? []).filter((r) => !r.applianceType);
  const perApplianceReadings = new Map<string, SmartMeterReading[]>();
  for (const r of smartMeterReadings ?? []) {
    if (r.applianceType) perApplianceReadings.set(r.applianceType, [...(perApplianceReadings.get(r.applianceType) ?? []), r]);
  }

  const rawByAppliance = present.map((a) => ({ entry: a, raw: rawMonthlyKWh(a) }));
  const rawTotal = rawByAppliance.reduce((sum, r) => sum + r.raw, 0);

  const smartMeterMonthlyTotal = wholeHouseReadings.length > 0 ? averageDailyKWh(wholeHouseReadings) * 30 : undefined;
  const billUnits = smartMeterMonthlyTotal ?? (bill?.unitsKWh && bill.unitsKWh > 0 ? bill.unitsKWh : rawTotal);
  const scaleFactor = rawTotal > 0 ? billUnits / rawTotal : 1;

  return rawByAppliance.map(({ entry, raw }) => {
    const readingsForAppliance = perApplianceReadings.get(entry.type);
    if (readingsForAppliance && readingsForAppliance.length > 0) {
      const exactKWh = round1(averageDailyKWh(readingsForAppliance) * 30);
      const exactPercent = billUnits > 0 ? round1((exactKWh / billUnits) * 100) : 0;
      return {
        type: entry.type,
        shareOfBillPercent: [exactPercent, exactPercent],
        estKWhPerMonth: [exactKWh, exactKWh],
        label: "real",
      };
    }

    const scaledKWh = raw * scaleFactor;
    const sharePercent = billUnits > 0 ? (scaledKWh / billUnits) * 100 : 0;
    // A real whole-house anchor narrows the honest uncertainty band vs a bill-only anchor.
    const spread = smartMeterMonthlyTotal != null ? 0.95 : 0.85;
    return {
      type: entry.type,
      shareOfBillPercent: [round1(sharePercent * spread), round1(sharePercent * (2 - spread))],
      estKWhPerMonth: [round1(scaledKWh * spread), round1(scaledKWh * (2 - spread))],
      label: "estimated",
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
