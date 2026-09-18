// Shared types for BijliSaathi. Kept dependency-free so both the server
// and any future Lambda/CDK code can import this package as-is.

export type DataLabel = "real" | "estimated" | "user-reported" | "projection" | "modelled";

/** Wraps any number/string the product shows so the UI can always render its label. */
export interface Labelled<T> {
  value: T;
  label: DataLabel;
  note?: string;
}

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

export type Shiftability = "yes" | "partly" | "no";

export interface EvDetails {
  vehicleType: "e_scooter" | "car";
  chargerType: string;
  dailyKm: number;
  parkedDaytime: "home" | "office" | "varies";
  departureTime: string; // "HH:mm"
  officeHasCharger: boolean;
}

export interface ApplianceEntry {
  type: ApplianceType;
  present: boolean;
  ev?: EvDetails;
}

export interface SmartMeterReading {
  date: string; // YYYY-MM-DD
  kWh: number;
  /** If set, this reading is for one appliance/circuit, not the whole house. */
  applianceType?: ApplianceType;
}

export interface LiveSmartPlugReading {
  watts: number;
  applianceType: ApplianceType;
  timestamp: string;
}

export interface Household {
  id: string;
  phone: string; // simulated WhatsApp number / chat handle
  language: Language;
  pincode?: string;
  state?: string;
  appliances: ApplianceEntry[];
  bill?: Bill;
  createdAt: string;
  conversationState: ConversationState;
  /** Real daily readings that, when present, replace the rated-power appliance estimate. */
  smartMeterReadings?: SmartMeterReading[];
  /** Rooftop solar panel capacity, if the household has one. */
  rooftopSolarKw?: number;
  /** Latest reading from a live-metered smart plug (software receiver, stretch #2). */
  latestSmartPlugReading?: LiveSmartPlugReading;
}

export type ConversationState =
  | "new"
  | "ask_language"
  | "ask_pincode"
  | "ask_bill"
  | "ask_appliances"
  | "ask_ev_details"
  | "onboarded";

export interface Bill {
  unitsKWh: number;
  amountRupees: number;
  periodStart: string;
  periodEnd: string;
  tariffCategory: string;
  meterType: "smart" | "conventional" | "unknown";
  confirmed: boolean;
  label: DataLabel; // "real" once user-confirmed, "estimated" if a mock guess pending confirmation
}

export interface ApplianceShare {
  type: ApplianceType;
  shareOfBillPercent: [number, number]; // range
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
  action: string; // human-readable instruction, calculator-derived
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

export interface ShiftLog {
  householdId: string;
  applianceType: ApplianceType;
  date: string;
  doneAt: string;
  estSavingsRupees: number;
  kWhMoved: number;
  isGreen: boolean;
}

export interface OutageReport {
  householdId: string;
  pincode: string;
  timestamp: string;
}

export interface SavingsSummary {
  totalRupeesSaved: number;
  totalKWhMovedOutOfPeak: number;
  totalCo2AvoidedKg: number;
  label: DataLabel;
}

export interface ImpactTotals extends SavingsSummary {
  householdCount: number;
  projectedNationalKWhPerDay: Labelled<number>;
}

export interface ChatMessage {
  from: "user" | "bot";
  text: string;
  timestamp: string;
}

/** The one rule that runs through the whole intelligence layer: the model writes
 * words, the calculator writes numbers. Every LLM call in this codebase must be
 * fed pre-computed numbers and only asked to phrase them. */
export interface PlanNumbers {
  cheapWindow: CheapWindow;
  cutRisk: CutRiskAssessment;
  actions: PlanAction[];
}

/** An apartment block / RWA: one shared-load plan, staggering member EV charging. */
export interface Society {
  id: string;
  name: string;
  pincode: string;
  memberHouseholdIds: string[];
  sharedLoadLimitKw: number;
  /** Never sent to clients except the manager's own session -- authorization.ts gates this. */
  managerToken: string;
  createdAt: string;
}

export interface StaggeredChargingSlot {
  householdId: string;
  applianceType: ApplianceType;
  windowStartHour: number;
  windowEndHour: number;
  chargerKw: number;
}

export interface SocietyPlan {
  societyId: string;
  date: string;
  sharedLoadLimitKw: number;
  slots: StaggeredChargingSlot[];
  label: DataLabel;
}
