// Minimal mirror of @bijli/domain's shapes, kept local so the browser bundle
// never needs to resolve the Node workspace packages. Keep in sync by hand.

export type DataLabel = "real" | "estimated" | "user-reported" | "projection" | "modelled";

export type Language = "en" | "hi" | "ta" | "mr" | "bn";

export const SUPPORTED_LANGUAGES: { code: Language; name: string }[] = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "ta", name: "Tamil" },
  { code: "mr", name: "Marathi" },
  { code: "bn", name: "Bengali" },
];

export type ApplianceType =
  | "ev_scooter"
  | "ev_car"
  | "water_pump"
  | "washing_machine"
  | "geyser"
  | "ac"
  | "fridge"
  | "fan"
  | "lights"
  | "wifi";

export const APPLIANCE_LABELS: Record<ApplianceType, string> = {
  ev_scooter: "E-scooter",
  ev_car: "Electric car",
  water_pump: "Water pump",
  washing_machine: "Washing machine",
  geyser: "Geyser",
  ac: "Air conditioner",
  fridge: "Fridge",
  fan: "Fans",
  lights: "Lights",
  wifi: "Wi-Fi router",
};

export interface EvDetails {
  vehicleType: "e_scooter" | "car";
  chargerType: string;
  dailyKm: number;
  parkedDaytime: "home" | "office" | "varies";
  departureTime: string;
  officeHasCharger: boolean;
}

export interface ApplianceEntry {
  type: ApplianceType;
  present: boolean;
  ev?: EvDetails;
}

export type ConversationState = "new" | "ask_language" | "ask_pincode" | "ask_bill" | "ask_appliances" | "ask_ev_details" | "onboarded";

export interface Bill {
  unitsKWh: number;
  amountRupees: number;
  periodStart: string;
  periodEnd: string;
  tariffCategory: string;
  meterType: "smart" | "conventional" | "unknown";
  confirmed: boolean;
  label: DataLabel;
}

export interface Household {
  id: string;
  phone: string;
  language: Language;
  pincode?: string;
  state?: string;
  appliances: ApplianceEntry[];
  bill?: Bill;
  createdAt: string;
  conversationState: ConversationState;
}

export interface ApplianceShare {
  type: ApplianceType;
  shareOfBillPercent: [number, number];
  estKWhPerMonth: [number, number];
  label: DataLabel;
}

export interface CheapWindow {
  date: string;
  startHour: number;
  endHour: number;
  reason: string;
  label: DataLabel;
}

export type RiskLevel = "low" | "medium" | "high";

export interface CutRiskAssessment {
  date: string;
  level: RiskLevel;
  windowStartHour: number;
  windowEndHour: number;
  reason: string;
  label: DataLabel;
}

export interface PlanAction {
  applianceType: ApplianceType;
  action: string;
  windowStartHour: number;
  windowEndHour: number;
  estSavingsRupees: number;
  estKWh: number;
  label: DataLabel;
  isGreen: boolean;
}

export interface DailyPlan {
  householdId: string;
  date: string;
  cheapWindow: CheapWindow;
  cutRisk: CutRiskAssessment;
  actions: PlanAction[];
  messageText: string;
}

export interface SavingsSummary {
  totalRupeesSaved: number;
  totalKWhMovedOutOfPeak: number;
  totalCo2AvoidedKg: number;
  label: DataLabel;
}

export interface ImpactTotals extends SavingsSummary {
  householdCount: number;
  projectedNationalKWhPerDay: { value: number; label: DataLabel; note?: string };
}
