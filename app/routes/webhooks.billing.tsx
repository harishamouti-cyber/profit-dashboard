import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { acceptWebhook } from "../lib/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);
  return acceptWebhook({ webhookId, shop, topic, payload });
};
