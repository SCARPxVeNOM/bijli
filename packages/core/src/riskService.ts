import type { TariffPlan } from "@bijli/data";
import type { CutRiskAssessment, RiskLevel } from "@bijli/domain";
import type { WeatherForecast } from "./weather.js";

export interface RiskInputs {
  tariff: TariffPlan;
  forecast: WeatherForecast;
  recentOutageReports: number; // user-reported cuts in this pincode, last 3 days
}

/**
 * Rule-based cut-risk score (low/medium/high), not a prediction of a specific
 * cut. Combines the real heat forecast, a summer-months grid-stress baseline
 * (coal carries ~75% of non-solar peak hours per the spec's cited figures),
 * and user-reported outages.
 */
export function computeCutRisk({ tariff, forecast, recentOutageReports }: RiskInputs): CutRiskAssessment {
  let score = 0;
  const reasons: string[] = [];

  if (forecast.maxTempC >= 40) {
    score += 3;
    reasons.push(`forecast high of ${forecast.maxTempC}°C`);
  } else if (forecast.maxTempC >= 37) {
    score += 2;
    reasons.push(`forecast high of ${forecast.maxTempC}°C`);
  } else if (forecast.maxTempC >= 33) {
    score += 1;
    reasons.push(`forecast high of ${forecast.maxTempC}°C`);
  }

  const month = new Date(forecast.date).getMonth() + 1; // 1-12
  if (month >= 4 && month <= 6) {
    score += 1;
    reasons.push("summer months, when coal carries most of the evening peak");
  }

  if (recentOutageReports > 0) {
    score += Math.min(recentOutageReports, 2);
    reasons.push(`${recentOutageReports} nearby outage report(s) in the last 3 days`);
  }

  let level: RiskLevel = "low";
  if (score >= 4) level = "high";
  else if (score >= 2) level = "medium";

  return {
    date: forecast.date,
    level,
    windowStartHour: tariff.peakWindow.startHour,
    windowEndHour: tariff.eveningPeakEndHour,
    reason: reasons.join("; ") || "no elevated signals",
    label: "modelled",
  };
}
