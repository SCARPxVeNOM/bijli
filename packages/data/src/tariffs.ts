import type { DataLabel } from "@bijli/domain";

/**
 * Time-of-Day tariff structure per the demo state's regulator order.
 *
 * Real, sourced numbers (not placeholders):
 * - Maharashtra (MSEDCL): a flat solar-hours rebate of Rs 0.80/kWh, 9am-5pm,
 *   and a 20% peak surcharge, 5pm-midnight, per the MERC MYT order for
 *   FY 2025-26. https://flinenergy.com/maharashtra-tod-tariff-net-metering-solar-2026/
 *   Domestic slab rate: Rs 10.45/kWh at the 101-300 unit slab, the typical
 *   urban household band. https://thediscombill.com/tariffs/maharashtra/msedcl/
 * - Delhi (BSES/DERC): DERC's rule for "other" (residential) consumers is
 *   solar hours >=20% cheaper, peak >=10% dearer, 8 solar hours per state
 *   regulator. https://www.derc.gov.in/publicnotice/time-day-tariff
 *   Domestic slab rate: Rs 4.50/kWh at the 200-400 unit slab.
 *   https://thediscombill.com/tariffs/delhi/
 *
 * Simplification kept on purpose: Indian domestic billing is telescopic
 * (multiple per-slab rates, not one flat rate). `normalRatePerKWh` here is
 * the marginal rate at the typical urban household's slab, documented per
 * state above -- not a full bill reconstruction. Everything downstream
 * (appliance estimate, plan ranking, EV savings) uses this single marginal
 * rate, which is the honest, called-out limit of this simplification.
 */
export interface TariffPlan {
  state: string;
  utilityLabel: string;
  normalRatePerKWh: number;
  solarWindow: { startHour: number; endHour: number };
  peakWindow: { startHour: number; endHour: number };
  /** Flat rebate per kWh during solar hours (Maharashtra's mechanism). */
  solarRebatePerKWh?: number;
  /** Percent discount off normalRatePerKWh during solar hours (Delhi's mechanism). Used only if solarRebatePerKWh is unset. */
  solarDiscountPercent?: number;
  peakSurchargePercent: number;
  /** When the evening crunch is considered over, for EV "charge after peak" logic. */
  eveningPeakEndHour: number;
  source: string;
  label: DataLabel;
}

export const TARIFF_PLANS: Record<string, TariffPlan> = {
  Maharashtra: {
    state: "Maharashtra",
    utilityLabel: "MSEDCL",
    normalRatePerKWh: 10.45,
    solarWindow: { startHour: 9, endHour: 17 },
    peakWindow: { startHour: 17, endHour: 24 },
    solarRebatePerKWh: 0.8,
    peakSurchargePercent: 20,
    eveningPeakEndHour: 24,
    source: "MERC MYT order for MSEDCL, FY 2025-26: Rs 0.80/kWh solar-hours rebate (9am-5pm), 20% peak surcharge (5pm-midnight). Domestic slab rate Rs 10.45/kWh at the 101-300 unit slab.",
    label: "real",
  },
  Delhi: {
    state: "Delhi",
    utilityLabel: "BSES (BRPL/BYPL)",
    normalRatePerKWh: 4.5,
    solarWindow: { startHour: 9, endHour: 17 },
    peakWindow: { startHour: 17, endHour: 22 },
    solarDiscountPercent: 20,
    peakSurchargePercent: 10,
    eveningPeakEndHour: 24,
    source: "DERC Time-of-Day rule: solar hours (8/day, state-set) at least 20% cheaper, peak at least 10% dearer for residential consumers. Domestic slab rate Rs 4.50/kWh at the 200-400 unit slab (BRPL/BYPL).",
    label: "real",
  },
};

/** peakRate/solarRate derived from a TariffPlan's real mechanism (flat rebate or percent discount). */
export function computeEffectiveRates(tariff: TariffPlan): { normalRate: number; peakRate: number; solarRate: number } {
  const normalRate = tariff.normalRatePerKWh;
  const peakRate = normalRate * (1 + tariff.peakSurchargePercent / 100);
  const solarRate =
    tariff.solarRebatePerKWh != null
      ? Math.max(0, normalRate - tariff.solarRebatePerKWh)
      : normalRate * (1 - (tariff.solarDiscountPercent ?? 0) / 100);
  return { normalRate, peakRate, solarRate };
}

export function getTariffPlan(state: string | undefined): TariffPlan {
  if (state && TARIFF_PLANS[state]) return TARIFF_PLANS[state];
  // Fall back to the first configured state so the demo never hard-fails.
  return Object.values(TARIFF_PLANS)[0];
}
