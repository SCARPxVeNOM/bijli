import { Router } from "express";
import multer from "multer";
import { authorize, runMay2026Backtest } from "@bijli/core";
import type { HouseholdService, SocietyService } from "@bijli/core";
import type { ApplianceEntry, Bill, Language, LiveSmartPlugReading, SmartMeterReading } from "@bijli/domain";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

export function buildRouter(households: HouseholdService, societies: SocietyService): Router {
  const router = Router();

  router.post("/households", async (req, res, next) => {
    try {
      const phone = String(req.body.phone ?? `web-${Date.now()}`);
      res.json(await households.startHousehold(phone));
    } catch (err) {
      next(err);
    }
  });

  router.get("/households/:id", async (req, res, next) => {
    try {
      res.json(await households.getHousehold(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/households/:id/language", async (req, res, next) => {
    try {
      const language = String(req.body.language) as Language;
      res.json(await households.setLanguage(req.params.id, language));
    } catch (err) {
      next(err);
    }
  });

  router.post("/households/:id/pincode", async (req, res, next) => {
    try {
      res.json(await households.setPincode(req.params.id, String(req.body.pincode)));
    } catch (err) {
      next(err);
    }
  });

  // Bill photo (multipart field "image") OR manual JSON fields under "manual".
  // Deletes the uploaded image bytes as soon as reading is done -- the spec's
  // privacy-by-design rule: never persist the bill photo, only extracted fields.
  router.post("/households/:id/bill", upload.single("image"), async (req, res, next) => {
    try {
      if (req.file) {
        const imageBase64 = req.file.buffer.toString("base64");
        const mimeType = req.file.mimetype;
        const household = await households.submitBill(req.params.id, { imageBase64, mimeType });
        res.json(household);
      } else {
        const manual = req.body.manual as Partial<Bill> | undefined;
        const household = await households.submitBill(req.params.id, { manual });
        res.json(household);
      }
    } catch (err) {
      next(err);
    }
  });

  router.post("/households/:id/bill/confirm", async (req, res, next) => {
    try {
      const corrections = req.body.corrections as Partial<Bill> | undefined;
      res.json(await households.confirmBill(req.params.id, corrections));
    } catch (err) {
      next(err);
    }
  });

  router.post("/households/:id/appliances", async (req, res, next) => {
    try {
      const appliances = req.body.appliances as ApplianceEntry[];
      const result = await households.setAppliances(req.params.id, appliances);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/households/:id/breakdown", async (req, res, next) => {
    try {
      res.json(await households.getApplianceShares(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get("/households/:id/plan", async (req, res, next) => {
    try {
      res.json(await households.getTodayPlan(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  // Manual "run the daily pipeline now" trigger -- useful for demos since the
  // real cron only fires once a day.
  router.post("/households/:id/plan", async (req, res, next) => {
    try {
      res.json(await households.generateDailyPlan(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  // Voice notes (stretch #5): real Gemini TTS. 501 (not "fake success") if
  // the active provider has no speech support, so the client can hide the
  // "Listen" control rather than play something bogus.
  router.post("/households/:id/plan/speech", async (req, res, next) => {
    try {
      res.json(await households.getPlanSpeech(req.params.id));
    } catch (err) {
      res.status(501).json({ error: (err as Error).message });
    }
  });

  router.post("/households/:id/ask", async (req, res, next) => {
    try {
      const answer = await households.askQuestion(req.params.id, String(req.body.question ?? ""));
      res.json({ answer });
    } catch (err) {
      next(err);
    }
  });

  router.post("/households/:id/done", async (req, res, next) => {
    try {
      const log = await households.logDone(req.params.id, req.body.applianceType);
      res.json(log);
    } catch (err) {
      next(err);
    }
  });

  router.post("/households/:id/outage", async (req, res, next) => {
    try {
      await households.reportOutage(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Live pincode outage map (upgrades stretch #1): the reports are real,
  // user-tapped data -- this just gives the last 24h a lat/lon to plot.
  router.get("/outages", async (req, res, next) => {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24;
      res.json(await households.listRecentOutages(hours));
    } catch (err) {
      next(err);
    }
  });

  // May 2026 heatwave backtest, run through the real pipeline (Part 2).
  router.get("/backtest/may2026", (_req, res, next) => {
    try {
      res.json(runMay2026Backtest());
    } catch (err) {
      next(err);
    }
  });

  // Smart meter data import (stretch #4): real daily readings replace the appliance estimate.
  router.post("/households/:id/smart-meter", async (req, res, next) => {
    try {
      const readings = req.body.readings as SmartMeterReading[];
      res.json(await households.importSmartMeterReadings(req.params.id, readings));
    } catch (err) {
      next(err);
    }
  });

  // Rooftop-solar homes (stretch #6).
  router.post("/households/:id/rooftop-solar", async (req, res, next) => {
    try {
      const rooftopSolarKw = Number(req.body.rooftopSolarKw ?? 0);
      res.json(await households.setRooftopSolar(req.params.id, rooftopSolarKw));
    } catch (err) {
      next(err);
    }
  });

  // Smart-plug software receiver (stretch #2) -- untested without real hardware.
  router.post("/households/:id/smart-plug/reading", async (req, res, next) => {
    try {
      const reading: LiveSmartPlugReading = {
        watts: Number(req.body.watts),
        applianceType: req.body.applianceType,
        timestamp: new Date().toISOString(),
      };
      await households.recordSmartPlugReading(req.params.id, reading);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/households/:id/smart-plug/latest", async (req, res, next) => {
    try {
      const reading = await households.getLatestSmartPlugReading(req.params.id);
      res.json(reading ?? null);
    } catch (err) {
      next(err);
    }
  });

  router.get("/households/:id/savings", async (req, res, next) => {
    try {
      res.json(await households.getSavingsSummary(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get("/impact", async (_req, res, next) => {
    try {
      res.json(await households.getImpactTotals());
    } catch (err) {
      next(err);
    }
  });

  // --- Society / RWA mode (stretch #3), with Cedar authorization (stretch #7's stable half) ---

  router.post("/societies", async (req, res, next) => {
    try {
      const { name, pincode, sharedLoadLimitKw } = req.body;
      const society = await societies.createSociety(String(name), String(pincode), Number(sharedLoadLimitKw));
      res.json(society);
    } catch (err) {
      next(err);
    }
  });

  router.post("/societies/:id/members", async (req, res, next) => {
    try {
      const managerToken = req.header("x-manager-token") ?? "";
      const society = await societies.getSociety(req.params.id);
      const principal = managerToken === society.managerToken ? { type: "SocietyManager" as const, id: society.id } : { type: "Public" as const, id: "anonymous" };
      if (!authorize(principal, "manageSociety", { type: "SocietyManager", id: society.id })) {
        return res.status(403).json({ error: "Only the society manager can add members." });
      }
      const updated = await societies.addMember(req.params.id, String(req.body.householdId));
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.get("/societies/:id/plan", async (req, res, next) => {
    try {
      const managerToken = req.header("x-manager-token") ?? "";
      const society = await societies.getSociety(req.params.id);
      const principal = managerToken === society.managerToken ? { type: "SocietyManager" as const, id: society.id } : { type: "Public" as const, id: "anonymous" };
      if (!authorize(principal, "viewSocietyAggregate", { type: "SocietyManager", id: society.id })) {
        return res.status(403).json({ error: "Only the society manager can view the staggered plan -- never an individual member's bill." });
      }
      res.json(await societies.buildStaggeredPlan(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.use((err: Error, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(400).json({ error: err.message });
  });

  return router;
}
