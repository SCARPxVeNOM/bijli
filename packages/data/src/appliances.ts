import type { ApplianceType, Shiftability } from "@bijli/domain";

export interface ApplianceRating {
  type: ApplianceType;
  displayName: string;
  ratedPowerWatts: number;
  typicalDailyHours: number;
  /** Duty-cycle / star-rating derating applied on top of rated power × hours. */
  usageFactor: number;
  shiftability: Shiftability;
  suggestedMove: string;
}

export const APPLIANCE_RATINGS: Record<ApplianceType, ApplianceRating> = {
  ev_scooter: {
    type: "ev_scooter",
    displayName: "E-scooter",
    ratedPowerWatts: 900,
    typicalDailyHours: 3,
    usageFactor: 0.6,
    shiftability: "yes",
    suggestedMove: "Charge in solar hours if parked at home; otherwise after the evening peak",
  },
  ev_car: {
    type: "ev_car",
    displayName: "Electric car",
    ratedPowerWatts: 5000,
    typicalDailyHours: 2,
    usageFactor: 0.6,
    shiftability: "yes",
    suggestedMove: "Charge in solar hours if parked at home; otherwise at office or after the evening peak",
  },
  water_pump: {
    type: "water_pump",
    displayName: "Water pump",
    ratedPowerWatts: 750,
    typicalDailyHours: 1,
    usageFactor: 0.9,
    shiftability: "yes",
    suggestedMove: "Fill the tank at midday, in the solar window",
  },
  washing_machine: {
    type: "washing_machine",
    displayName: "Washing machine",
    ratedPowerWatts: 1200,
    typicalDailyHours: 1,
    usageFactor: 0.8,
    shiftability: "yes",
    suggestedMove: "Run inside the solar window",
  },
  geyser: {
    type: "geyser",
    displayName: "Geyser / water heater",
    ratedPowerWatts: 2000,
    typicalDailyHours: 1,
    usageFactor: 0.5,
    shiftability: "partly",
    suggestedMove: "Heat just before use; avoid the evening peak",
  },
  ac: {
    type: "ac",
    displayName: "Air conditioner",
    ratedPowerWatts: 1500,
    typicalDailyHours: 8,
    usageFactor: 0.55,
    shiftability: "partly",
    suggestedMove: "Pre-cool before the peak; raise the set-point during it",
  },
  fridge: {
    type: "fridge",
    displayName: "Fridge",
    ratedPowerWatts: 150,
    typicalDailyHours: 24,
    usageFactor: 0.35,
    shiftability: "no",
    suggestedMove: "Never suggested",
  },
  fan: {
    type: "fan",
    displayName: "Fans",
    ratedPowerWatts: 70,
    typicalDailyHours: 10,
    usageFactor: 0.8,
    shiftability: "no",
    suggestedMove: "Never suggested",
  },
  lights: {
    type: "lights",
    displayName: "Lights",
    ratedPowerWatts: 40,
    typicalDailyHours: 6,
    usageFactor: 0.9,
    shiftability: "no",
    suggestedMove: "Never suggested",
  },
  wifi: {
    type: "wifi",
    displayName: "Wi-Fi router",
    ratedPowerWatts: 15,
    typicalDailyHours: 24,
    usageFactor: 1,
    shiftability: "no",
    suggestedMove: "Never suggested",
  },
};

/** Approximate energy-per-km used to size EV charging need from daily distance. */
export const EV_ENERGY_PER_KM: Record<"e_scooter" | "car", number> = {
  e_scooter: 0.02, // kWh/km
  car: 0.15, // kWh/km
};

/** Typical home charger draw, per the spec's approximate loads. */
export const EV_CHARGER_KW: Record<"e_scooter" | "car", number> = {
  e_scooter: 0.9,
  car: 5,
};
