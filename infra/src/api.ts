import serverlessHttp from "serverless-http";
import { DynamoDbStore, HouseholdService } from "@bijli/core";
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
const app = buildApp(households);

export const handler = serverlessHttp(app);
