import cors from "cors";
import express from "express";
import type { HouseholdService, SocietyService } from "@bijli/core";
import { buildRouter } from "./routes.js";
import { buildTwiMlReply, handleIncomingWhatsApp } from "./whatsapp.js";

/** The Express app, with no `.listen()` call, so it can be reused both by
 * the standalone server entrypoint (index.ts) and a future Lambda handler
 * (wrapped with serverless-http) behind API Gateway. */
export function buildApp(households: HouseholdService, societies: SocietyService) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", buildRouter(households, societies));
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Real WhatsApp channel (Twilio Sandbox). Twilio posts form-urlencoded,
  // not JSON, and expects a synchronous TwiML XML reply -- kept outside
  // /api since it's a different transport, not a JSON REST call.
  app.post("/whatsapp/webhook", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const from = String(req.body.From ?? "");
      const body = String(req.body.Body ?? "");
      const numMedia = Number(req.body.NumMedia ?? 0);
      const media = numMedia > 0 ? { url: String(req.body.MediaUrl0), contentType: String(req.body.MediaContentType0) } : undefined;
      const reply = await handleIncomingWhatsApp(households, from, body, media);
      res.type("text/xml").send(buildTwiMlReply(reply));
    } catch (err) {
      console.error("WhatsApp webhook error:", err);
      res.type("text/xml").send(buildTwiMlReply("Sorry, something went wrong on our end. Please try again in a moment."));
    }
  });

  return app;
}
