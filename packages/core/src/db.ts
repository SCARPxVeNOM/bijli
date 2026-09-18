import fs from "node:fs";
import path from "node:path";
import type { DailyPlan, Household, OutageReport, ShiftLog, Society } from "@bijli/domain";

/**
 * Storage contract shared by every backing store BijliSaathi can run
 * against: the local JSON file (`JsonDb`, below) and the real
 * `DynamoDbStore` (packages/core/src/dynamoDbStore.ts) used when running
 * against AWS or LocalStack. `HouseholdService` depends only on this
 * interface, never on a concrete store, so swapping the backend touches
 * nothing else.
 */
export interface Store {
  getHousehold(id: string): Promise<Household | undefined>;
  putHousehold(h: Household): Promise<void>;
  listHouseholds(): Promise<Household[]>;
  putPlan(plan: DailyPlan): Promise<void>;
  getPlan(householdId: string, date: string): Promise<DailyPlan | undefined>;
  listPlansForHousehold(householdId: string): Promise<DailyPlan[]>;
  addShiftLog(log: ShiftLog): Promise<void>;
  listShiftLogs(householdId?: string): Promise<ShiftLog[]>;
  addOutageReport(report: OutageReport): Promise<void>;
  listOutageReports(pincode?: string): Promise<OutageReport[]>;
  recentOutageCount(pincode: string, withinMs: number): Promise<number>;
  getSociety(id: string): Promise<Society | undefined>;
  putSociety(society: Society): Promise<void>;
  listSocieties(): Promise<Society[]>;
}

/**
 * A tiny JSON-file store standing in for DynamoDB during the local prototype.
 * Shape mirrors the four DynamoDB "tables" from the spec's architecture
 * (households, plans, shift logs, outage reports).
 */
interface DbShape {
  households: Record<string, Household>;
  plans: Record<string, DailyPlan>; // key: `${householdId}:${date}`
  shiftLogs: ShiftLog[];
  outageReports: OutageReport[];
  societies: Record<string, Society>;
}

const EMPTY: DbShape = { households: {}, plans: {}, shiftLogs: [], outageReports: [], societies: {} };

export class JsonDb implements Store {
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
  async getHousehold(id: string): Promise<Household | undefined> {
    return this.data.households[id];
  }

  async putHousehold(h: Household): Promise<void> {
    this.data.households[h.id] = h;
    this.save();
  }

  async listHouseholds(): Promise<Household[]> {
    return Object.values(this.data.households);
  }

  // --- plans ---
  async putPlan(plan: DailyPlan): Promise<void> {
    this.data.plans[`${plan.householdId}:${plan.date}`] = plan;
    this.save();
  }

  async getPlan(householdId: string, date: string): Promise<DailyPlan | undefined> {
    return this.data.plans[`${householdId}:${date}`];
  }

  async listPlansForHousehold(householdId: string): Promise<DailyPlan[]> {
    return Object.values(this.data.plans).filter((p) => p.householdId === householdId);
  }

  // --- shift logs ---
  async addShiftLog(log: ShiftLog): Promise<void> {
    this.data.shiftLogs.push(log);
    this.save();
  }

  async listShiftLogs(householdId?: string): Promise<ShiftLog[]> {
    return householdId ? this.data.shiftLogs.filter((l) => l.householdId === householdId) : this.data.shiftLogs;
  }

  // --- outage reports ---
  async addOutageReport(report: OutageReport): Promise<void> {
    this.data.outageReports.push(report);
    this.save();
  }

  async listOutageReports(pincode?: string): Promise<OutageReport[]> {
    return pincode ? this.data.outageReports.filter((r) => r.pincode === pincode) : this.data.outageReports;
  }

  async recentOutageCount(pincode: string, withinMs: number): Promise<number> {
    const cutoff = Date.now() - withinMs;
    return this.data.outageReports.filter((r) => r.pincode === pincode && new Date(r.timestamp).getTime() >= cutoff)
      .length;
  }

  // --- societies ---
  async getSociety(id: string): Promise<Society | undefined> {
    return this.data.societies[id];
  }

  async putSociety(society: Society): Promise<void> {
    this.data.societies[society.id] = society;
    this.save();
  }

  async listSocieties(): Promise<Society[]> {
    return Object.values(this.data.societies);
  }
}
