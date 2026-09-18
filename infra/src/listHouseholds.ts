import { DynamoDbStore } from "@bijli/core";

/**
 * First step of the daily pipeline's Step Functions state machine: returns
 * the onboarded household IDs for the Map state to fan out over
 * (generatePlan.ts runs once per ID).
 */
const store = new DynamoDbStore();

export const handler = async (): Promise<string[]> => {
  const households = await store.listHouseholds();
  return households.filter((h) => h.conversationState === "onboarded").map((h) => h.id);
};
