import type { DataLabel } from "@bijli/domain";

/** National figures quoted directly from the spec's cited sources (Energetica India, Reuters/The News). */
export const NATIONAL_GRID_FACTS = {
  peakDemandMetGW: { value: 270.8, period: "May 2026", source: "Energetica India", label: "real" as DataLabel },
  energyShortageFY2526: { value: 0, unit: "percent, nationally", source: "Energetica India", label: "real" as DataLabel },
  coalShareAprJun2026Percent: { value: 69.54, source: "Energetica India", label: "real" as DataLabel },
  coalInNonSolarPeakPercent: { value: 75, note: "up to about 188.8 GW of 251.4 GW", source: "Energetica India", label: "real" as DataLabel },
  eveningPeakDeficitMayHeatwaveGW: { value: 2.57, source: "Reuters, via The News (Grid-India)", label: "real" as DataLabel },
};

/**
 * Illustrative hourly solar-share curve (0-1) used to shape "how sunny is the
 * grid right now" before it's adjusted by the day's real cloud-cover forecast.
 * Bell-shaped, peaking at midday, zero at night. This is a shape assumption,
 * not a live feed — always surfaced as "estimated".
 */
export const HOURLY_SOLAR_SHARE_SHAPE: number[] = [
  0, 0, 0, 0, 0, 0.05, 0.15, 0.35, 0.55, 0.75, 0.85, 0.92, 0.95, 0.92, 0.85, 0.7, 0.5, 0.25, 0.1, 0.02, 0, 0, 0, 0,
];

/**
 * A hand-entered backtest scenario for the May 2026 heatwave, used for the
 * "proof" slide/demo moment. Values are the spec's own cited figures; the
 * per-hour deficit shape is an illustrative reconstruction for the chart.
 */
export const MAY_2026_HEATWAVE_BACKTEST = {
  date: "2026-05-15",
  state: "Maharashtra",
  peakDemandMetGW: 270.8,
  eveningDeficitGW: 2.57,
  deficitWindow: { startHour: 19, endHour: 22 },
  label: "real" as DataLabel,
  note: "State/day are illustrative anchoring for the demo; the GW figures are the spec's cited national numbers.",
};
