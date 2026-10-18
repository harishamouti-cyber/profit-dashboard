import { Prisma, type Job } from "@prisma/client";
import db from "../db.server";

export async function enqueue(input: {
  shopDomain: string;
  type: string;
  payload?: Prisma.InputJsonValue;
  runAt?: Date;
}): Promise<Job> {
  return db.job.create({
    data: {
      shopDomain: input.shopDomain,
      type: input.type,
      payload: input.payload ?? {},
      runAt: input.runAt ?? new Date(),
    },
  });
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
