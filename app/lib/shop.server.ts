import db from "../db.server";
import { authenticate } from "../shopify.server";
import { refreshPlanIfStale } from "./sync/bootstrap.server";

export async function requireShop(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  let shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    shop = await refreshPlanIfStale(admin, session.shop);
  }
  if (!shop) throw new Response("Shop was not created", { status: 500 });
  return { admin, session, shop };
}

export async function requireFreshShop(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  const shop = await refreshPlanIfStale(admin, session.shop);
  if (!shop) throw new Response("Shop was not created", { status: 500 });
  return { admin, session, shop };
}
