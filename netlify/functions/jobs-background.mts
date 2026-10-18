// Netlify background function (the "-background" suffix makes it one): answers 202 at once and
// runs for up to 15 minutes. Drains the Postgres job queue, then exits as soon as it is empty,
// so idle invocations cost almost nothing. Called by the 5-minute schedule (jobs-tick) and
// kicked by enqueue() when new work arrives. Several invocations may overlap safely.
import { timingSafeEqual } from "node:crypto";
import { runJobsBatch } from "../../app/jobs/worker.server";

// Stop picking up new jobs after 12 minutes so the last job can finish within the 15-minute limit.
const BUDGET_MS = 12 * 60 * 1000;

function authorized(req: Request): boolean {
  const expected = process.env.JOBS_SECRET || "";
  const given = req.headers.get("x-jobs-secret") || "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async (req: Request) => {
  if (!authorized(req)) {
    console.warn("jobs-background: unauthorized call ignored");
    return;
  }
  try {
    const result = await runJobsBatch({ budgetMs: BUDGET_MS });
    console.log(`jobs-background: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error("jobs-background failed", error);
  }
};
