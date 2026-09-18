import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import cron from "node-cron";
import { HouseholdService, JsonDb } from "@bijli/core";
import { buildApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = path.join(__dirname, "..", ".data", "db.json");

const db = new JsonDb(DB_PATH);
const households = new HouseholdService(db);
const app = buildApp(households);

app.listen(PORT, () => {
  console.log(`BijliSaathi server listening on http://localhost:${PORT}`);
});

// Stands in for the EventBridge Scheduler + Step Functions daily pipeline:
// regenerates every onboarded household's plan once a day. Also exposed as a
// manual "run pipeline now" endpoint (POST /api/households/:id/plan) for demos.
cron.schedule("0 18 * * *", async () => {
  const all = await db.listHouseholds();
  for (const h of all) {
    if (h.conversationState === "onboarded") {
      await households.generateDailyPlan(h.id).catch((err) => console.error(`Plan generation failed for ${h.id}:`, err));
    }
  }
});
