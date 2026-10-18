import type { PrismaClient } from "@prisma/client";

/** Hard-delete every row owned by the shop, plus its sessions. Shop cascade covers the rest. */
export async function redactShop(db: PrismaClient, shopDomain: string): Promise<void> {
  await db.session.deleteMany({ where: { shop: shopDomain } });
  await db.job.deleteMany({ where: { shopDomain } });
  await db.processedWebhook.deleteMany({ where: { shopDomain } });
  await db.shop.deleteMany({ where: { shopDomain } });
}

/** customers/redact: nothing is keyed by a person. Blank listed order names when we have them. */
export async function redactOrderNames(
  db: PrismaClient,
  shopDomain: string,
  orderIds: number[],
): Promise<void> {
  if (orderIds.length === 0) return;
  const shop = await db.shop.findUnique({ where: { shopDomain }, select: { id: true } });
  if (!shop) return;
  const gids = orderIds.map((id) => `gid://shopify/Order/${id}`);
  await db.order.updateMany({
    where: { shopId: shop.id, orderGid: { in: gids } },
    data: { name: "redacted" },
  });
}
