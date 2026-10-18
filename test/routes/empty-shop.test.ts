import { afterAll, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: async () => ({
      admin: {
        graphql: async () => {
          throw new Error("network disabled");
        },
      },
      session: { shop: "empty-shop.myshopify.com", scope: "read_orders,read_products,read_inventory" },
    }),
    webhook: async () => {
      throw new Error("unused");
    },
  },
  login: () => ({}),
  addDocumentResponseHeaders: () => {},
}));

import db from "../../app/db.server";
import { loader as dashboard } from "../../app/routes/app._index";
import { loader as products } from "../../app/routes/app.products";
import { loader as costs } from "../../app/routes/app.costs";
import { loader as adSpend } from "../../app/routes/app.ad-spend";
import { loader as expenses } from "../../app/routes/app.expenses";
import { loader as settings } from "../../app/routes/app.settings";
import { loader as billing } from "../../app/routes/app.billing";
import { loader as onboarding } from "../../app/routes/app.onboarding";
import { loader as appLayout } from "../../app/routes/app";
import { loader as landing } from "../../app/routes/_index/route";
import { loader as health } from "../../app/routes/health";
import { redactShop } from "../../app/lib/privacy/redact.server";

const domain = "empty-shop.myshopify.com";

function args(path: string): LoaderFunctionArgs {
  return {
    request: new Request(`https://example.com${path}`),
    params: {},
    context: {},
  } as LoaderFunctionArgs;
}

afterAll(async () => {
  await redactShop(db, domain);
  await db.$disconnect();
});

describe("pages with an empty shop", () => {
  it("renders every embedded loader before any orders exist", async () => {
    await db.shop.upsert({
      where: { shopDomain: domain },
      create: {
        shopDomain: domain,
        currencyCode: "USD",
        ianaTimezone: "America/Los_Angeles",
        planSyncedAt: new Date(),
      },
      update: { planSyncedAt: new Date(), uninstalledAt: null },
    });

    const home = await dashboard(args("/app?from=not-a-date&to=2026-13-40&preset=nope"));
    expect(home.table).toEqual([]);
    expect(home.orderCount).toBe(0);
    expect(home.kpis.netProfit.value).toContain("$");
    expect(home.from <= home.to).toBe(true);

    const productPage = await products(args("/app/products?q=tee"));
    expect(productPage.products).toEqual([]);
    expect(productPage.variantCount).toBe(0);

    const costPage = await costs(args("/app/costs?missing=1"));
    expect(costPage.rows).toEqual([]);

    const ads = await adSpend(args("/app/ad-spend"));
    expect(ads.rows).toEqual([]);
    expect(ads.days.length).toBe(14);

    const expensePage = await expenses(args("/app/expenses"));
    expect(expensePage.count).toBe(0);

    const settingsPage = await settings(args("/app/settings"));
    expect(settingsPage.currency).toBe("USD");
    expect(settingsPage.rules).toEqual([]);

    const billingPage = await billing(args("/app/billing"));
    expect(billingPage.plan).toBe("NONE");
    expect(billingPage.pricingUrl).toContain("profit-dashboard");

    const start = await onboarding(args("/app/onboarding"));
    expect(start.doneCount).toBe(0);
    expect(start.steps).toHaveLength(4);

    const layout = await appLayout(args("/app"));
    expect(layout.plan).toBe("NONE");

    const marketing = await landing(args("/"));
    expect(marketing.showForm).toBe(true);

    const probe = await health();
    expect(probe.status).toBe(200);
    expect(await probe.text()).toBe("ok");
  });

  it("still returns a shop when bootstrap cannot reach Shopify", async () => {
    await redactShop(db, domain);
    const layout = await appLayout(args("/app"));
    expect(layout.plan).toBe("NONE");
    const shop = await db.shop.findUnique({ where: { shopDomain: domain } });
    expect(shop).not.toBeNull();
    const queued = await db.job.count({ where: { shopDomain: domain, type: "refresh_billing" } });
    expect(queued).toBeGreaterThan(0);
  });
});
