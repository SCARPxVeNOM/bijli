import { EV_ENERGY_PER_KM } from "@bijli/data";
import type { TariffPlan } from "@bijli/data";
import type { ApplianceEntry, CheapWindow, PlanAction } from "@bijli/domain";

/**
 * The EV module's decision flowchart from the spec: charge at home in solar
 * hours if parked there; otherwise at the office if it has a charger;
 * otherwise after the evening peak. Night charging saves money but is never
 * labelled green, since the grid is coal-heavy after dark.
 */
export function planEvCharging(entry: ApplianceEntry, tariff: TariffPlan, cheapWindow: CheapWindow): PlanAction | undefined {
  if (!entry.ev) return undefined;
  const { vehicleType, dailyKm, parkedDaytime, officeHasCharger } = entry.ev;
  const kWhNeeded = Math.round(dailyKm * EV_ENERGY_PER_KM[vehicleType] * 10) / 10;
  const normalRate = tariff.normalRatePerKWh;
  const peakRate = normalRate * (1 + tariff.peakSurchargePercent / 100);
  const solarRate = normalRate * (1 - tariff.solarDiscountPercent / 100);

  const applianceType = entry.type;

  if (parkedDaytime === "home") {
    const savings = kWhNeeded * (peakRate - solarRate);
    return {
      applianceType,
      action: `Charge ${vehicleType === "car" ? "the car" : "the scooter"} ${cheapWindow.startHour}:00-${cheapWindow.endHour}:00 (solar hours), not in the evening — top up ~${kWhNeeded} kWh for tomorrow's ${dailyKm} km`,
      windowStartHour: cheapWindow.startHour,
      windowEndHour: cheapWindow.endHour,
      estSavingsRupees: Math.round(savings),
      estKWh: kWhNeeded,
      label: "estimated",
      isGreen: true,
    };
  }

  if (parkedDaytime === "office" && officeHasCharger) {
    const savings = kWhNeeded * (peakRate - solarRate);
    return {
      applianceType,
      action: `Charge at the office during the day (~${kWhNeeded} kWh) instead of at home tonight`,
      windowStartHour: tariff.solarWindow.startHour,
      windowEndHour: tariff.solarWindow.endHour,
      estSavingsRupees: Math.round(savings),
      estKWh: kWhNeeded,
      label: "estimated",
      isGreen: true,
    };
  }

  // No daytime charger available: charge after the evening peak. Cheaper, not cleaner.
  const savings = kWhNeeded * (peakRate - normalRate);
  return {
    applianceType,
    action: `No daytime charger available — charge after ${tariff.eveningPeakEndHour}:00 tonight (~${kWhNeeded} kWh). Cheaper than charging now, but not clean: night power is mostly coal.`,
    windowStartHour: tariff.eveningPeakEndHour,
    windowEndHour: tariff.eveningPeakEndHour + 3,
    estSavingsRupees: Math.round(savings),
    estKWh: kWhNeeded,
    label: "estimated",
    isGreen: false,
  };
}
