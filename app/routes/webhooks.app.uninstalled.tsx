import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { handleShopifyWebhook } from "../lib/webhooks.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await authenticate.webhook(request);
  await db.session.deleteMany({ where: { shop: result.shop } });
  return handleShopifyWebhook(request, result);
};
