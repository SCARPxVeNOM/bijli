import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DailyPlan, Household, OutageReport, ShiftLog, Society } from "@bijli/domain";
import type { Store } from "./db.js";

export interface DynamoDbStoreConfig {
  householdsTable?: string;
  plansTable?: string;
  shiftLogsTable?: string;
  outageReportsTable?: string;
  societiesTable?: string;
  /** LocalStack endpoint, e.g. http://localhost:4566. Unset for real AWS. */
  endpoint?: string;
}

/**
 * The real backing store for the SAM/LocalStack (and eventual production
 * AWS) deployment. Implements the exact same `Store` contract as `JsonDb` --
 * `HouseholdService` doesn't know or care which one it's talking to. Table
 * names and endpoint come from env vars set by the SAM template so this
 * class has no LocalStack-specific logic of its own.
 */
export class DynamoDbStore implements Store {
  private doc: DynamoDBDocumentClient;
  private householdsTable: string;
  private plansTable: string;
  private shiftLogsTable: string;
  private outageReportsTable: string;
  private societiesTable: string;

  constructor(config: DynamoDbStoreConfig = {}) {
    const endpoint = config.endpoint ?? process.env.AWS_ENDPOINT_URL;
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
      ...(endpoint ? { endpoint } : {}),
    });
    this.doc = DynamoDBDocumentClient.from(client);
    this.householdsTable = config.householdsTable ?? process.env.HOUSEHOLDS_TABLE ?? "Households";
    this.plansTable = config.plansTable ?? process.env.PLANS_TABLE ?? "Plans";
    this.shiftLogsTable = config.shiftLogsTable ?? process.env.SHIFT_LOGS_TABLE ?? "ShiftLogs";
    this.outageReportsTable = config.outageReportsTable ?? process.env.OUTAGE_REPORTS_TABLE ?? "OutageReports";
    this.societiesTable = config.societiesTable ?? process.env.SOCIETIES_TABLE ?? "Societies";
  }

  async getHousehold(id: string): Promise<Household | undefined> {
    const res = await this.doc.send(new GetCommand({ TableName: this.householdsTable, Key: { id } }));
    return res.Item as Household | undefined;
  }

  async putHousehold(h: Household): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.householdsTable, Item: h }));
  }

  async listHouseholds(): Promise<Household[]> {
    const res = await this.doc.send(new ScanCommand({ TableName: this.householdsTable }));
    return (res.Items ?? []) as Household[];
  }

  async putPlan(plan: DailyPlan): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.plansTable, Item: plan }));
  }

  async getPlan(householdId: string, date: string): Promise<DailyPlan | undefined> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.plansTable, Key: { householdId, date } })
    );
    return res.Item as DailyPlan | undefined;
  }

  async listPlansForHousehold(householdId: string): Promise<DailyPlan[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.plansTable,
        KeyConditionExpression: "householdId = :h",
        ExpressionAttributeValues: { ":h": householdId },
      })
    );
    return (res.Items ?? []) as DailyPlan[];
  }

  async addShiftLog(log: ShiftLog): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.shiftLogsTable, Item: log }));
  }

  async listShiftLogs(householdId?: string): Promise<ShiftLog[]> {
    if (householdId) {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.shiftLogsTable,
          KeyConditionExpression: "householdId = :h",
          ExpressionAttributeValues: { ":h": householdId },
        })
      );
      return (res.Items ?? []) as ShiftLog[];
    }
    const res = await this.doc.send(new ScanCommand({ TableName: this.shiftLogsTable }));
    return (res.Items ?? []) as ShiftLog[];
  }

  async addOutageReport(report: OutageReport): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.outageReportsTable, Item: report }));
  }

  async listOutageReports(pincode?: string): Promise<OutageReport[]> {
    if (pincode) {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.outageReportsTable,
          KeyConditionExpression: "pincode = :p",
          ExpressionAttributeValues: { ":p": pincode },
        })
      );
      return (res.Items ?? []) as OutageReport[];
    }
    const res = await this.doc.send(new ScanCommand({ TableName: this.outageReportsTable }));
    return (res.Items ?? []) as OutageReport[];
  }

  async recentOutageCount(pincode: string, withinMs: number): Promise<number> {
    const reports = await this.listOutageReports(pincode);
    const cutoff = Date.now() - withinMs;
    return reports.filter((r) => new Date(r.timestamp).getTime() >= cutoff).length;
  }

  async getSociety(id: string): Promise<Society | undefined> {
    const res = await this.doc.send(new GetCommand({ TableName: this.societiesTable, Key: { id } }));
    return res.Item as Society | undefined;
  }

  async putSociety(society: Society): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.societiesTable, Item: society }));
  }

  async listSocieties(): Promise<Society[]> {
    const res = await this.doc.send(new ScanCommand({ TableName: this.societiesTable }));
    return (res.Items ?? []) as Society[];
  }
}
