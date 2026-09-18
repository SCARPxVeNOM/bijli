import type { ImpactTotals, SavingsSummary, ShiftLog } from "@bijli/domain";

/** Rough kg-CO2-per-kWh avoided when load moves from the coal-heavy evening
 * peak to a cleaner (solar-hours or daytime) window. Only counted for shifts
 * flagged green -- night charging that merely saves money earns no CO2 credit. */
const CO2_AVOIDED_PER_GREEN_KWH = 0.6;

export function summarizeShiftLogs(logs: ShiftLog[]): SavingsSummary {
  const totalRupeesSaved = logs.reduce((sum, l) => sum + l.estSavingsRupees, 0);
  const totalKWhMovedOutOfPeak = logs.reduce((sum, l) => sum + l.kWhMoved, 0);
  const totalCo2AvoidedKg = logs.filter((l) => l.isGreen).reduce((sum, l) => sum + l.kWhMoved * CO2_AVOIDED_PER_GREEN_KWH, 0);
  return {
    totalRupeesSaved: Math.round(totalRupeesSaved),
    totalKWhMovedOutOfPeak: Math.round(totalKWhMovedOutOfPeak * 10) / 10,
    totalCo2AvoidedKg: Math.round(totalCo2AvoidedKg * 10) / 10,
    label: "user-reported",
  };
}

/**
 * Scales the logged-during-testing totals to a labelled national projection,
 * per the spec's public impact counter (always marked as a projection, never
 * presented as a forecast).
 */
export function computeImpactTotals(logs: ShiftLog[], householdCount: number, indiaHouseholdsMillions = 250): ImpactTotals {
  const summary = summarizeShiftLogs(logs);
  const perHouseholdKWh = householdCount > 0 ? summary.totalKWhMovedOutOfPeak / householdCount : 0;
  const projectedNationalKWhPerDay = perHouseholdKWh * indiaHouseholdsMillions * 1_000_000;
  return {
    ...summary,
    householdCount,
    projectedNationalKWhPerDay: {
      value: Math.round(projectedNationalKWhPerDay),
      label: "projection",
      note: `Arithmetic scale-up: (kWh moved per tested household) x ~${indiaHouseholdsMillions}M Indian households. Illustrative, not a forecast.`,
    },
  };
}
