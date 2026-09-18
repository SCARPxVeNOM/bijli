import serverlessHttp from "serverless-http";
import { DynamoDbStore, HouseholdService, SocietyService } from "@bijli/core";
import { buildApp } from "@bijli/server/app";

/**
 * The API Gateway + Lambda entry point. This is the exact same Express app
 * and routes as the Railway deployment (apps/server/src/app.ts) -- only the
 * backing store differs (DynamoDB via LocalStack/AWS instead of the JSON
 * file), and only the transport differs (API Gateway's proxy event instead
 * of a real socket, via serverless-http).
 */
const store = new DynamoDbStore();
const households = new HouseholdService(store);
const societies = new SocietyService(store, households);
const app = buildApp(households, societies);
const httpHandler = serverlessHttp(app);

/**
 * Cold-start mitigation (Part 11): EventBridge pings this function directly
 * (not through API Gateway) every 5 minutes to keep one execution
 * environment warm. A direct Lambda:Invoke from EventBridge always carries
 * `source: "aws.events"` -- detect that and return immediately, without
 * touching Express or DynamoDB, so the warmup ping itself never costs a
 * database round-trip.
 */
export const handler = async (event: any, context: any) => {
  if (event?.source === "aws.events") {
    return { statusCode: 200, body: "warm" };
  }
  return httpHandler(event, context);
};
