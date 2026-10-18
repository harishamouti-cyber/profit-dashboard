import db from "../../db.server";
import { adminQuery } from "../admin.server";
import type { AdminClient } from "../billing.server";
import { INVENTORY_ITEM_COST, PRODUCT_FOR_CATALOG } from "../graphql/queries";
import { D, toDb, type Decimal } from "../money";
import { localDate, toDbDate } from "../tz";
import { readVariant, type JsonObject, type NormalizedVariant } from "./assemble.server";

export async function upsertVariants(shopId: string, variants: NormalizedVariant[]): Promise<void> {
  for (const variant of variants) {
    await db.variant.upsert({
      where: { shopId_variantGid: { shopId, variantGid: variant.variantGid } },
      create: {
        shopId,
        variantGid: variant.variantGid,
        productGid: variant.productGid,
        inventoryItemGid: variant.inventoryItemGid,
        productTitle: variant.productTitle,
        variantTitle: variant.variantTitle,
        sku: variant.sku,
        shopifyUnitCost: variant.shopifyUnitCost == null ? null : toDb(variant.shopifyUnitCost),
      },
      update: {
        productGid: variant.productGid,
        inventoryItemGid: variant.inventoryItemGid,
        productTitle: variant.productTitle,
        variantTitle: variant.variantTitle,
        sku: variant.sku,
        shopifyUnitCost: variant.shopifyUnitCost == null ? null : toDb(variant.shopifyUnitCost),
      },
    });
  }
}

/** Insert a SHOPIFY history row when the catalog cost changed. Past order lines keep unitCostUsed. */
export async function recordShopifyCost(
  shopId: string,
  variantGid: string,
  unitCost: Decimal | null,
  ianaTimezone: string,
): Promise<void> {
  if (unitCost == null) return;
  const latest = await db.variantCost.findFirst({
    where: { shopId, variantGid, source: "SHOPIFY" },
    orderBy: { effectiveFrom: "desc" },
  });
  if (latest && D(latest.unitCost).eq(unitCost)) return;
  await db.variantCost.create({
    data: {
      shopId,
      variantGid,
      unitCost: toDb(unitCost),
      effectiveFrom: toDbDate(localDate(new Date(), ianaTimezone)),
      source: "SHOPIFY",
    },
  });
}

export async function syncInventoryItem(admin: AdminClient, shopDomain: string, inventoryItemGid: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  const data = await adminQuery<{
    inventoryItem: {
      id: string;
      unitCost: { amount: string } | null;
      variants: { nodes: Array<{ id: string }> };
    } | null;
  }>(admin, INVENTORY_ITEM_COST, { id: inventoryItemGid });
  const item = data.inventoryItem;
  if (!item) return;
  const unit = item.unitCost?.amount != null ? D(item.unitCost.amount) : null;
  for (const variant of item.variants.nodes) {
    await db.variant.updateMany({
      where: { shopId: shop.id, variantGid: variant.id },
      data: {
        inventoryItemGid: item.id,
        shopifyUnitCost: unit == null ? null : toDb(unit),
      },
    });
    await recordShopifyCost(shop.id, variant.id, unit, shop.ianaTimezone);
  }
}

export async function syncProduct(admin: AdminClient, shopDomain: string, productGid: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  const data = await adminQuery<{ product: JsonObject | null }>(admin, PRODUCT_FOR_CATALOG, {
    id: productGid,
  });
  const product = data.product;
  if (!product) return;
  const connection = product.variants as { nodes?: JsonObject[] } | undefined;
  const nodes = connection?.nodes ?? [];
  const variants = nodes
    .map((node) => readVariant(node))
    .filter((variant): variant is NormalizedVariant => variant != null);
  await upsertVariants(shop.id, variants);
  for (const variant of variants) {
    await recordShopifyCost(shop.id, variant.variantGid, variant.shopifyUnitCost, shop.ianaTimezone);
  }
}
