import fs from "node:fs";
import path from "node:path";
import type { DailyPlan, Household, OutageReport, ShiftLog } from "@bijli/domain";

/**
 * A tiny JSON-file store standing in for DynamoDB during the local prototype.
 * Shape mirrors the four DynamoDB "tables" from the spec's architecture
 * (households, plans, shift logs, outage reports) so swapping in the real
 * DynamoDB client later is a matter of re-implementing this class, not the
 * services that call it.
 */
interface DbShape {
  households: Record<string, Household>;
  plans: Record<string, DailyPlan>; // key: `${householdId}:${date}`
  shiftLogs: ShiftLog[];
  outageReports: OutageReport[];
}

const EMPTY: DbShape = { households: {}, plans: {}, shiftLogs: [], outageReports: [] };

export class JsonDb {
  private filePath: string;
  private data: DbShape;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = this.load();
  }

  private load(): DbShape {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return { ...EMPTY, ...JSON.parse(raw) };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  // --- households ---
  getHousehold(id: string): Household | undefined {
    return this.data.households[id];
  }

  putHousehold(h: Household) {
    this.data.households[h.id] = h;
    this.save();
  }

  listHouseholds(): Household[] {
    return Object.values(this.data.households);
  }

  // --- plans ---
  putPlan(plan: DailyPlan) {
    this.data.plans[`${plan.householdId}:${plan.date}`] = plan;
    this.save();
  }

  getPlan(householdId: string, date: string): DailyPlan | undefined {
    return this.data.plans[`${householdId}:${date}`];
  }

  listPlansForHousehold(householdId: string): DailyPlan[] {
    return Object.values(this.data.plans).filter((p) => p.householdId === householdId);
  }

  // --- shift logs ---
  addShiftLog(log: ShiftLog) {
    this.data.shiftLogs.push(log);
    this.save();
  }

  listShiftLogs(householdId?: string): ShiftLog[] {
    return householdId ? this.data.shiftLogs.filter((l) => l.householdId === householdId) : this.data.shiftLogs;
  }

  // --- outage reports ---
  addOutageReport(report: OutageReport) {
    this.data.outageReports.push(report);
    this.save();
  }

  listOutageReports(pincode?: string): OutageReport[] {
    return pincode ? this.data.outageReports.filter((r) => r.pincode === pincode) : this.data.outageReports;
  }

  recentOutageCount(pincode: string, withinMs: number): number {
    const cutoff = Date.now() - withinMs;
    return this.data.outageReports.filter((r) => r.pincode === pincode && new Date(r.timestamp).getTime() >= cutoff)
      .length;
  }
}
