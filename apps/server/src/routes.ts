import { Router } from "express";
import multer from "multer";
import type { HouseholdService } from "@bijli/core";
import type { ApplianceEntry, Bill, Language } from "@bijli/domain";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

export function buildRouter(households: HouseholdService): Router {
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

  router.use((err: Error, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(400).json({ error: err.message });
  });

  return router;
}
