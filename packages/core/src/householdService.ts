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
  LiveSmartPlugReading,
  SavingsSummary,
  ShiftLog,
  SmartMeterReading,
} from "@bijli/domain";
import { estimateApplianceShares } from "./applianceEstimator.js";
import { computeCheapWindow } from "./cheapHours.js";
import type { Store } from "./db.js";
import { getLLMProvider } from "./llm/index.js";
import { buildDailyPlan } from "./planService.js";
import { computeCutRisk } from "./riskService.js";
import { computeImpactTotals, summarizeShiftLogs } from "./savings.js";
import { fetchWeatherForecast } from "./weather.js";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export class HouseholdService {
  constructor(private db: Store) {}

  async startHousehold(phone: string): Promise<Household> {
    const household: Household = {
      id: nanoid(10),
      phone,
      language: "en",
      appliances: [],
      createdAt: new Date().toISOString(),
      conversationState: "ask_language",
    };
    await this.db.putHousehold(household);
    return household;
  }

  async getHousehold(id: string): Promise<Household> {
    const h = await this.db.getHousehold(id);
    if (!h) throw new Error(`Unknown household ${id}`);
    return h;
  }

  async setLanguage(id: string, language: Language): Promise<Household> {
    const h = await this.getHousehold(id);
    h.language = language;
    h.conversationState = "ask_pincode";
    await this.db.putHousehold(h);
    return h;
  }

  async setPincode(id: string, pincode: string): Promise<Household> {
    const h = await this.getHousehold(id);
    const info = resolvePincode(pincode);
    h.pincode = pincode;
    h.state = info.state;
    h.conversationState = "ask_bill";
    await this.db.putHousehold(h);
    return h;
  }

  async submitBill(id: string, opts: { imageBase64?: string; mimeType?: string; manual?: Partial<Bill> }): Promise<Household> {
    const h = await this.getHousehold(id);
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
    await this.db.putHousehold(h);
    return h;
  }

  async confirmBill(id: string, corrections?: Partial<Bill>): Promise<Household> {
    const h = await this.getHousehold(id);
    if (!h.bill) throw new Error("No bill to confirm");
    h.bill = { ...h.bill, ...corrections, confirmed: true, label: "real" };
    h.conversationState = "ask_appliances";
    await this.db.putHousehold(h);
    return h;
  }

  async setAppliances(id: string, appliances: ApplianceEntry[]): Promise<{ household: Household; shares: ApplianceShare[]; plan: DailyPlan }> {
    const h = await this.getHousehold(id);
    h.appliances = appliances;
    h.conversationState = "onboarded";
    await this.db.putHousehold(h);
    const shares = estimateApplianceShares(h.appliances, h.bill, h.smartMeterReadings);
    const plan = await this.generateDailyPlan(id);
    return { household: h, shares, plan };
  }

  /** Simulates the Step Functions daily pipeline: fetch -> forecast -> risk -> plan -> message. */
  async generateDailyPlan(id: string): Promise<DailyPlan> {
    const h = await this.getHousehold(id);
    const tariff = getTariffPlan(h.state);
    const pincodeInfo = h.pincode ? resolvePincode(h.pincode) : undefined;
    const forecast = await fetchWeatherForecast(pincodeInfo?.lat ?? 19.0, pincodeInfo?.lon ?? 72.8);
    const cheapWindow = computeCheapWindow(tariff, forecast);
    const recentOutages = h.pincode ? await this.db.recentOutageCount(h.pincode, 3 * 24 * 60 * 60 * 1000) : 0;
    const cutRisk = computeCutRisk({ tariff, forecast, recentOutageReports: recentOutages });
    const shares = estimateApplianceShares(h.appliances, h.bill, h.smartMeterReadings);
    const actions = buildDailyPlan(h.appliances, shares, tariff, cheapWindow, h.rooftopSolarKw);

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
    await this.db.putPlan(plan);
    return plan;
  }

  /** Smart meter data import (stretch #4): real daily readings replace the appliance estimate. */
  async importSmartMeterReadings(id: string, readings: SmartMeterReading[]): Promise<Household> {
    const h = await this.getHousehold(id);
    h.smartMeterReadings = readings;
    await this.db.putHousehold(h);
    return h;
  }

  async setRooftopSolar(id: string, rooftopSolarKw: number): Promise<Household> {
    const h = await this.getHousehold(id);
    h.rooftopSolarKw = rooftopSolarKw;
    await this.db.putHousehold(h);
    return h;
  }

  /** Smart-plug software receiver (stretch #2) -- untested without real hardware. */
  async recordSmartPlugReading(id: string, reading: LiveSmartPlugReading): Promise<void> {
    const h = await this.getHousehold(id);
    h.latestSmartPlugReading = reading;
    await this.db.putHousehold(h);
  }

  async getLatestSmartPlugReading(id: string): Promise<LiveSmartPlugReading | undefined> {
    const h = await this.getHousehold(id);
    return h.latestSmartPlugReading;
  }

  async getApplianceShares(id: string): Promise<ApplianceShare[]> {
    const h = await this.getHousehold(id);
    return estimateApplianceShares(h.appliances, h.bill, h.smartMeterReadings);
  }

  async getTodayPlan(id: string): Promise<DailyPlan> {
    const plans = await this.db.listPlansForHousehold(id);
    const existing = plans.sort((a, b) => b.date.localeCompare(a.date))[0];
    if (existing) return existing;
    return this.generateDailyPlan(id);
  }

  async askQuestion(id: string, question: string): Promise<string> {
    const h = await this.getHousehold(id);
    const plan = await this.getTodayPlan(id);
    const context = { plan, currentHour: new Date().getHours() };
    if (process.env.STRANDS_QA === "true") {
      try {
        const { answerWithStrands } = await import("./llm/strandsQaAgent.js");
        return await answerWithStrands(question, context, h.language, h.state);
      } catch (err) {
        console.error("Strands QA agent failed, falling back to direct Gemini call:", err);
      }
    }
    const provider = getLLMProvider();
    return provider.answerQuestion(question, context, h.language);
  }

  /** Voice notes (stretch #5). Throws if the active provider has no real TTS (mock/Anthropic) -- callers should let that surface as "unavailable", never fake audio. */
  async getPlanSpeech(id: string) {
    const h = await this.getHousehold(id);
    const plan = await this.getTodayPlan(id);
    const provider = getLLMProvider();
    if (!provider.synthesizeSpeech) throw new Error(`${provider.name} does not support speech synthesis`);
    return provider.synthesizeSpeech(plan.messageText, h.language);
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
    await this.db.addShiftLog(log);
    return log;
  }

  async reportOutage(id: string): Promise<void> {
    const h = await this.getHousehold(id);
    if (!h.pincode) throw new Error("Household has no pincode yet");
    await this.db.addOutageReport({ householdId: id, pincode: h.pincode, timestamp: new Date().toISOString() });
  }

  async getSavingsSummary(id: string): Promise<SavingsSummary> {
    return summarizeShiftLogs(await this.db.listShiftLogs(id));
  }

  async getImpactTotals(): Promise<ImpactTotals> {
    const [logs, households] = await Promise.all([this.db.listShiftLogs(), this.db.listHouseholds()]);
    return computeImpactTotals(logs, households.length);
  }

  async listOutageReportsByPincode(pincode: string) {
    return this.db.listOutageReports(pincode);
  }

  /** All outage reports in the last `hours`, joined with real lat/lon for the outage map. */
  async listRecentOutages(hours = 24) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const all = await this.db.listOutageReports();
    return all
      .filter((r) => new Date(r.timestamp).getTime() >= cutoff)
      .map((r) => {
        const info = resolvePincode(r.pincode);
        return { ...r, lat: info.lat, lon: info.lon, city: info.city };
      });
  }
}
