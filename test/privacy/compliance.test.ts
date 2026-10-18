import type { ActionFunctionArgs } from "react-router";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    webhook: async (request: Request) => {
      const body = (await request.json()) as {
        shop: string;
        topic: string;
        payload: Record<string, unknown>;
        webhookId: string;
      };
      return body;
    },
  },
}));

import { action } from "../../app/routes/webhooks.compliance";
import db from "../../app/db.server";

afterAll(async () => {
  await db.$disconnect();
});

describe("compliance webhook route", () => {
  it("returns 200 for customers/data_request, customers/redact, and shop/redact", async () => {
    const topics = ["customers/data_request", "customers/redact", "shop/redact"];
    for (const topic of topics) {
      const response = await action({
        request: new Request("https://example.com/webhooks/compliance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shop: "compliance-route.myshopify.com",
            topic,
            payload: { orders_to_redact: [] },
            webhookId: `compliance-${topic}-${Date.now()}`,
          }),
        }),
        params: {},
        context: {},
      } as ActionFunctionArgs);
      expect(response.status).toBe(200);
    }
  });
});
