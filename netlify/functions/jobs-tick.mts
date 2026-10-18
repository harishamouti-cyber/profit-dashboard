// Netlify scheduled function: every 5 minutes, wake the background job runner (which also
// schedules the 15-minute reconcile and recovers stuck jobs). Scheduled functions are limited to
// 30 seconds, so the real work happens in jobs-background.
import type { Config } from "@netlify/functions";

export default async () => {
  const appUrl = process.env.SHOPIFY_APP_URL;
  const secret = process.env.JOBS_SECRET;
  if (!appUrl || !secret) {
    console.error("jobs-tick: SHOPIFY_APP_URL or JOBS_SECRET missing");
    return;
  }
  const res = await fetch(new URL("/.netlify/functions/jobs-background", appUrl), {
    method: "POST",
    headers: { "x-jobs-secret": secret },
    signal: AbortSignal.timeout(10_000),
  });
  console.log(`jobs-tick: runner responded ${res.status}`);
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
