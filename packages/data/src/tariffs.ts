import type { DataLabel } from "@bijli/domain";

/**
 * Time-of-Day tariff structure per the demo state's regulator order.
 *
 * IMPORTANT: the rate/hour figures below are ILLUSTRATIVE placeholders that sit
 * inside the legal ToD band described in the spec (solar hours 10-20% cheaper,
 * peak hours 10-20% dearer). Before a real demo, replace these with the actual
 * numbers from your demo state's current tariff order and flip `label` to "real".
 */
export interface TariffPlan {
  state: string;
  utilityLabel: string;
  normalRatePerKWh: number;
  solarWindow: { startHour: number; endHour: number };
  peakWindow: { startHour: number; endHour: number };
  solarDiscountPercent: number;
  peakSurchargePercent: number;
  /** When the evening crunch is considered over, for EV "charge after peak" logic. */
  eveningPeakEndHour: number;
  source: string;
  label: DataLabel;
}

export const TARIFF_PLANS: Record<string, TariffPlan> = {
  Maharashtra: {
    state: "Maharashtra",
    utilityLabel: "State discom (sample tariff)",
    normalRatePerKWh: 9.5,
    solarWindow: { startHour: 9, endHour: 17 },
    peakWindow: { startHour: 18, endHour: 22 },
    solarDiscountPercent: 15,
    peakSurchargePercent: 15,
    eveningPeakEndHour: 23,
    source: "Illustrative placeholder within the ToD band from SolarQuarter/ToD rules cited in the spec. Replace with the verified tariff order before a real demo.",
    label: "estimated",
  },
  Delhi: {
    state: "Delhi",
    utilityLabel: "State discom (sample tariff)",
    normalRatePerKWh: 8.0,
    solarWindow: { startHour: 9, endHour: 17 },
    peakWindow: { startHour: 17, endHour: 21 },
    solarDiscountPercent: 20,
    peakSurchargePercent: 20,
    eveningPeakEndHour: 22,
    source: "Illustrative placeholder within the ToD band from SolarQuarter/ToD rules cited in the spec. Replace with the verified tariff order before a real demo.",
    label: "estimated",
  },
};

export function getTariffPlan(state: string | undefined): TariffPlan {
  if (state && TARIFF_PLANS[state]) return TARIFF_PLANS[state];
  // Fall back to the first configured state so the demo never hard-fails.
  return Object.values(TARIFF_PLANS)[0];
}
