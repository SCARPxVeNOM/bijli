import { DynamoDbStore, HouseholdService } from "@bijli/core";

/**
 * The Map state's per-household task: runs the actual
 * fetch -> forecast -> risk -> plan -> message pipeline for one household
 * and writes the result to the Plans table.
 */
const store = new DynamoDbStore();
const households = new HouseholdService(store);

export const handler = async (event: { householdId: string }) => {
  const plan = await households.generateDailyPlan(event.householdId);
  return { householdId: event.householdId, date: plan.date };
};
