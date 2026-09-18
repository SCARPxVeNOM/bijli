import { nanoid } from "nanoid";
import { getTariffPlan } from "@bijli/data";
import { resolvePincode } from "@bijli/data";
import type {
  ApplianceEntry,
  ApplianceShare,
  Bill,
  DailyPlan,
  Household,
  ImpactTotals,
  Language,
  SavingsSummary,
  ShiftLog,
} from "@bijli/domain";
import { estimateApplianceShares } from "./applianceEstimator.js";
import { computeCheapWindow } from "./cheapHours.js";
import { JsonDb } from "./db.js";
import { getLLMProvider } from "./llm/index.js";
import { buildDailyPlan } from "./planService.js";
import { computeCutRisk } from "./riskService.js";
import { computeImpactTotals, summarizeShiftLogs } from "./savings.js";
import { fetchWeatherForecast } from "./weather.js";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export class HouseholdService {
  constructor(private db: JsonDb) {}

  startHousehold(phone: string): Household {
    const household: Household = {
      id: nanoid(10),
      phone,
      language: "en",
      appliances: [],
      createdAt: new Date().toISOString(),
      conversationState: "ask_language",
    };
    this.db.putHousehold(household);
    return household;
  }

  getHousehold(id: string): Household {
    const h = this.db.getHousehold(id);
    if (!h) throw new Error(`Unknown household ${id}`);
    return h;
  }

  setLanguage(id: string, language: Language): Household {
    const h = this.getHousehold(id);
    h.language = language;
    h.conversationState = "ask_pincode";
    this.db.putHousehold(h);
    return h;
  }

  setPincode(id: string, pincode: string): Household {
    const h = this.getHousehold(id);
    const info = resolvePincode(pincode);
    h.pincode = pincode;
    h.state = info.state;
    h.conversationState = "ask_bill";
    this.db.putHousehold(h);
    return h;
  }

  async submitBill(id: string, opts: { imageBase64?: string; mimeType?: string; manual?: Partial<Bill> }): Promise<Household> {
    const h = this.getHousehold(id);
    let fields: Partial<Bill>;
    if (opts.manual) {
      fields = { ...opts.manual, confirmed: false, label: "estimated" };
    } else if (opts.imageBase64 && opts.mimeType) {
      const provider = getLLMProvider();
      fields = await provider.readBill(opts.imageBase64, opts.mimeType);
    } else {
      throw new Error("submitBill requires either manual fields or an image");
    }
    h.bill = {
      unitsKWh: Number(fields.unitsKWh ?? 0),
      amountRupees: Number(fields.amountRupees ?? 0),
      periodStart: String(fields.periodStart ?? ""),
      periodEnd: String(fields.periodEnd ?? ""),
      tariffCategory: String(fields.tariffCategory ?? "Domestic"),
      meterType: (fields.meterType as Bill["meterType"]) ?? "unknown",
      confirmed: false,
      label: "estimated",
    };
    this.db.putHousehold(h);
    return h;
  }

  confirmBill(id: string, corrections?: Partial<Bill>): Household {
    const h = this.getHousehold(id);
    if (!h.bill) throw new Error("No bill to confirm");
    h.bill = { ...h.bill, ...corrections, confirmed: true, label: "real" };
    h.conversationState = "ask_appliances";
    this.db.putHousehold(h);
    return h;
  }

  async setAppliances(id: string, appliances: ApplianceEntry[]): Promise<{ household: Household; shares: ApplianceShare[]; plan: DailyPlan }> {
    const h = this.getHousehold(id);
    h.appliances = appliances;
    h.conversationState = "onboarded";
    this.db.putHousehold(h);
    const shares = estimateApplianceShares(h.appliances, h.bill);
    const plan = await this.generateDailyPlan(id);
    return { household: h, shares, plan };
  }

  /** Simulates the Step Functions daily pipeline: fetch -> forecast -> risk -> plan -> message. */
  async generateDailyPlan(id: string): Promise<DailyPlan> {
    const h = this.getHousehold(id);
    const tariff = getTariffPlan(h.state);
    const pincodeInfo = h.pincode ? resolvePincode(h.pincode) : undefined;
    const forecast = await fetchWeatherForecast(pincodeInfo?.lat ?? 19.0, pincodeInfo?.lon ?? 72.8);
    const cheapWindow = computeCheapWindow(tariff, forecast);
    const recentOutages = h.pincode ? this.db.recentOutageCount(h.pincode, 3 * 24 * 60 * 60 * 1000) : 0;
    const cutRisk = computeCutRisk({ tariff, forecast, recentOutageReports: recentOutages });
    const shares = estimateApplianceShares(h.appliances, h.bill);
    const actions = buildDailyPlan(h.appliances, shares, tariff, cheapWindow);

    const provider = getLLMProvider();
    const messageText = await provider.writeDailyMessage({ cheapWindow, cutRisk, actions }, h.language);

    const plan: DailyPlan = {
      householdId: id,
      date: forecast.date,
      cheapWindow,
      cutRisk,
      actions,
      messageText,
    };
    this.db.putPlan(plan);
    return plan;
  }

  getApplianceShares(id: string): ApplianceShare[] {
    const h = this.getHousehold(id);
    return estimateApplianceShares(h.appliances, h.bill);
  }

  async getTodayPlan(id: string): Promise<DailyPlan> {
    const existing = this.db.listPlansForHousehold(id).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (existing) return existing;
    return this.generateDailyPlan(id);
  }

  async askQuestion(id: string, question: string): Promise<string> {
    const h = this.getHousehold(id);
    const plan = await this.getTodayPlan(id);
    const provider = getLLMProvider();
    return provider.answerQuestion(question, { plan, currentHour: new Date().getHours() }, h.language);
  }

  async logDone(id: string, applianceType: ApplianceEntry["type"]): Promise<ShiftLog> {
    const plan = await this.getTodayPlan(id);
    const action = plan.actions.find((a) => a.applianceType === applianceType);
    const log: ShiftLog = {
      householdId: id,
      applianceType,
      date: todayDateString(),
      doneAt: new Date().toISOString(),
      estSavingsRupees: action?.estSavingsRupees ?? 0,
      kWhMoved: action?.estKWh ?? 0,
      isGreen: action?.isGreen ?? false,
    };
    this.db.addShiftLog(log);
    return log;
  }

  reportOutage(id: string): void {
    const h = this.getHousehold(id);
    if (!h.pincode) throw new Error("Household has no pincode yet");
    this.db.addOutageReport({ householdId: id, pincode: h.pincode, timestamp: new Date().toISOString() });
  }

  getSavingsSummary(id: string): SavingsSummary {
    return summarizeShiftLogs(this.db.listShiftLogs(id));
  }

  getImpactTotals(): ImpactTotals {
    return computeImpactTotals(this.db.listShiftLogs(), this.db.listHouseholds().length);
  }

  listOutageReportsByPincode(pincode: string) {
    return this.db.listOutageReports(pincode);
  }
}
