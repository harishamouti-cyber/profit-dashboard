import type { ActionFunctionArgs } from "react-router";
import { handleShopifyWebhook } from "../lib/webhooks.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await authenticate.webhook(request);
  return handleShopifyWebhook(request, result);
};
