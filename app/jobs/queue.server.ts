import { Prisma, type Job } from "@prisma/client";
import db from "../db.server";

export async function enqueue(input: {
  shopDomain: string;
  type: string;
  payload?: Prisma.InputJsonValue;
  runAt?: Date;
}): Promise<Job> {
  const job = await db.job.create({
    data: {
      shopDomain: input.shopDomain,
      type: input.type,
      payload: input.payload ?? {},
      runAt: input.runAt ?? new Date(),
    },
  });
  if (!input.runAt || input.runAt.getTime() <= Date.now()) await kickRunner();
  return job;
}

let lastKickAt = 0;
const KICK_DEBOUNCE_MS = 20_000;

/**
 * Serverless only (no embedded worker): wake the Netlify background job runner so new jobs run
 * within seconds instead of waiting for the 5-minute schedule. The background function answers
 * 202 immediately. Debounced per instance, skipped inside a runner, and never throws: the
 * scheduled tick picks up anything a failed kick missed.
 */
export async function kickRunner(): Promise<void> {
  if (process.env.DISABLE_EMBEDDED_WORKER !== "1") return;
  const secret = process.env.JOBS_SECRET;
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!secret || !appUrl) return;
  if ((globalThis as { __penniJobsRunnerActive?: boolean }).__penniJobsRunnerActive) return;
  const now = Date.now();
  if (now - lastKickAt < KICK_DEBOUNCE_MS) return;
  lastKickAt = now;
  try {
    await fetch(new URL("/.netlify/functions/jobs-background", appUrl), {
      method: "POST",
      headers: { "x-jobs-secret": secret },
      signal: AbortSignal.timeout(2500),
    });
  } catch (error) {
    console.warn("job runner kick failed", error instanceof Error ? error.message : error);
  }
}

export async function claimWebhook(id: string, shopDomain: string, topic: string): Promise<boolean> {
  try {
    await db.processedWebhook.create({ data: { id, shopDomain, topic } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

export function readResourceGid(payload: Record<string, unknown>): string | null {
  const value = payload.admin_graphql_api_id;
  return typeof value === "string" ? value : null;
}

export function readOrderId(payload: Record<string, unknown>): string | null {
  const value = payload.order_id;
  if (typeof value === "number" || typeof value === "string") {
    return `gid://shopify/Order/${value}`;
  }
  return null;
}
