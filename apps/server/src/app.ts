import cors from "cors";
import express from "express";
import type { HouseholdService } from "@bijli/core";
import { buildRouter } from "./routes.js";

/** The Express app, with no `.listen()` call, so it can be reused both by
 * the standalone server entrypoint (index.ts) and a future Lambda handler
 * (wrapped with serverless-http) behind API Gateway. */
export function buildApp(households: HouseholdService) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", buildRouter(households));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  return app;
}
