import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { asWebhookPayload, handleShopifyWebhook } from "../lib/webhooks.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await authenticate.webhook(request);
  const payload = asWebhookPayload(result.payload);
  const current = Array.isArray(payload.current) ? payload.current.map(String) : [];
  if (result.session) {
    await db.session.update({
      where: { id: result.session.id },
      data: { scope: current.join(",") },
    });
  }
  return handleShopifyWebhook(request, result);
};
