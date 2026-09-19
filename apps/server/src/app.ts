import cors from "cors";
import express from "express";
import type { HouseholdService, SocietyService } from "@bijli/core";
import { buildRouter } from "./routes.js";
import { handleIncomingWhatsApp, sendWhatsAppMessage } from "./whatsapp.js";

/** The Express app, with no `.listen()` call, so it can be reused both by
 * the standalone server entrypoint (index.ts) and a future Lambda handler
 * (wrapped with serverless-http) behind API Gateway. */
export function buildApp(households: HouseholdService, societies: SocietyService) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", buildRouter(households, societies));
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Real WhatsApp channel (Twilio). Twilio posts form-urlencoded, not JSON --
  // kept outside /api since it's a different transport, not a JSON REST
  // call. Twilio's trial account no longer honors a TwiML reply written
  // into this response, so we send the reply as a separate outbound REST
  // call (using the inbound `To` as our `From`) and just ack the webhook.
  app.post("/whatsapp/webhook", express.urlencoded({ extended: false }), async (req, res) => {
    const from = String(req.body.From ?? "");
    const to = String(req.body.To ?? "");
    const body = String(req.body.Body ?? "");
    res.type("text/xml").send("<Response></Response>");
    try {
      const numMedia = Number(req.body.NumMedia ?? 0);
      const media = numMedia > 0 ? { url: String(req.body.MediaUrl0), contentType: String(req.body.MediaContentType0) } : undefined;
      const reply = await handleIncomingWhatsApp(households, from, body, media);
      await sendWhatsAppMessage(from, reply, to);
    } catch (err) {
      console.error("WhatsApp webhook error:", err);
      await sendWhatsAppMessage(from, "Sorry, something went wrong on our end. Please try again in a moment.", to);
    }
  });

  return app;
}
