import { D, type Decimal } from "../money";

export type CostSource = "SHOPIFY" | "MANUAL" | "CSV" | "SKU_FALLBACK";

export interface CostRow {
  variantGid: string;
  unitCost: Decimal;
  /** Shop-local yyyy-MM-dd. */
  effectiveFrom: string;
  source: CostSource | string;
}

/**
 * MANUAL beats CSV and SKU_FALLBACK, which beat SHOPIFY, when effectiveFrom ties.
 * Otherwise the latest effectiveFrom on or before the sale date wins.
 */
function sourceRank(source: string): number {
  if (source === "MANUAL") return 3;
  if (source === "CSV" || source === "SKU_FALLBACK") return 2;
  return 1;
}

export function unitCostAt(
  history: CostRow[],
  variantGid: string | null | undefined,
  localDate: string,
  shopifyUnitCost: Decimal | null = null,
): { unitCost: Decimal | null; missing: boolean } {
  if (!variantGid) {
    return shopifyUnitCost == null
      ? { unitCost: null, missing: true }
      : { unitCost: shopifyUnitCost, missing: false };
  }

  const candidates = history.filter(
    (row) => row.variantGid === variantGid && row.effectiveFrom <= localDate,
  );
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.effectiveFrom !== b.effectiveFrom) {
        return a.effectiveFrom < b.effectiveFrom ? -1 : 1;
      }
      return sourceRank(a.source) - sourceRank(b.source);
    });
    const best = candidates[candidates.length - 1];
    return { unitCost: D(best.unitCost), missing: false };
  }

  if (shopifyUnitCost != null) {
    return { unitCost: D(shopifyUnitCost), missing: false };
  }
  return { unitCost: null, missing: true };
}

export function skuFallbackGid(sku: string): string {
  return `sku:${sku.trim()}`;
}
