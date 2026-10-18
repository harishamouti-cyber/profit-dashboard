import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { D } from "../../app/lib/money";
import { dailyShare } from "../../app/lib/profit/expenses";
import { paymentFees } from "../../app/lib/profit/fees";
import { accumulateDays, ratiosFromSums } from "../../app/lib/profit/daily";
import { computeOrder, lineNetSalesExTax, type CostResolver } from "../../app/lib/profit/order";
import { computeRefund } from "../../app/lib/profit/refund";
import { unitCostAt } from "../../app/lib/profit/costs";
import { daysInMonth, localDate } from "../../app/lib/tz";

function money(actual: { toFixed: (digits: number) => string }, expected: string) {
  expect(actual.toFixed(4)).toBe(D(expected).toFixed(4));
}

const noCost: CostResolver = () => ({ unitCost: null, missing: true });

describe("profit formulas", () => {
  it("(a) tax-inclusive VAT line nets to 90", () => {
    const fixture = JSON.parse(readFileSync("test/fixtures/vat-inclusive-order.json", "utf8")) as {
      taxesIncluded: boolean;
      originalTotal: string;
      discountTotal: string;
      taxTotal: string;
      expectedNetSalesExTax: string;
    };
    const net = lineNetSalesExTax(
      D(fixture.originalTotal),
      D(fixture.discountTotal),
      D(fixture.taxTotal),
      fixture.taxesIncluded,
    );
    money(net, fixture.expectedNetSalesExTax);

    const order = computeOrder(
      {
        taxesIncluded: true,
        localDate: "2026-06-01",
        lines: [
          {
            lineItemGid: "line-1",
            title: "Tee",
            quantity: 1,
            isGiftCard: false,
            requiresShipping: true,
            originalTotal: D(fixture.originalTotal),
            discountTotal: D(fixture.discountTotal),
            taxTotal: D(fixture.taxTotal),
          },
        ],
        shippingLines: [],
        transactions: [],
      },
      {
        feeMode: "ACTUAL_THEN_RULE",
        gatewayRules: [],
        shippingCostMode: "NONE",
        shippingFlatCost: D(0),
        shippingPercent: D(0),
        manualShippingCost: null,
      },
      noCost,
    );
    money(order.revenue, "90");
    money(order.lines[0].grossExTax, "102");
  });

  it("(b) tax-exclusive tax stays out of revenue", () => {
    const net = lineNetSalesExTax(D(100), D(10), D(8), false);
    money(net, "90");
    const order = computeOrder(
      {
        taxesIncluded: false,
        localDate: "2026-06-01",
        lines: [
          {
            lineItemGid: "line-1",
            title: "Tee",
            quantity: 1,
            isGiftCard: false,
            requiresShipping: true,
            originalTotal: D(100),
            discountTotal: D(0),
            taxTotal: D(8),
          },
        ],
        shippingLines: [{ isRemoved: false, discountedPrice: D(10), taxTotal: D(1) }],
        transactions: [],
      },
      {
        feeMode: "RULE_ONLY",
        gatewayRules: [],
        shippingCostMode: "NONE",
        shippingFlatCost: D(0),
        shippingPercent: D(0),
        manualShippingCost: null,
      },
      noCost,
    );
    money(order.revenue, "110");
    money(order.lineTax, "8");
    money(order.shippingTax, "1");
    expect(order.revenue.eq(order.lineTax.plus(order.shippingTax).plus(110))).toBe(false);
  });

  it("(c) refunds book on the refund local date in Los Angeles and Karachi", () => {
    const fixture = JSON.parse(readFileSync("test/fixtures/timezone-refund.json", "utf8")) as {
      orderProcessedAt: string;
      refundProcessedAt: string;
      americaLosAngeles: { orderLocalDate: string; refundLocalDate: string };
      asiaKarachi: { orderLocalDate: string; refundLocalDate: string };
    };

    for (const [zone, expected] of [
      ["America/Los_Angeles", fixture.americaLosAngeles],
      ["Asia/Karachi", fixture.asiaKarachi],
    ] as const) {
      const orderDay = localDate(fixture.orderProcessedAt, zone);
      const refundDay = localDate(fixture.refundProcessedAt, zone);
      expect(orderDay).toBe(expected.orderLocalDate);
      expect(refundDay).toBe(expected.refundLocalDate);
      expect(orderDay).not.toBe(refundDay);

      const { days } = accumulateDays({
        orders: [
          {
            key: "order-1",
            localDate: orderDay,
            cancelledLocalDate: null,
            test: false,
            totalPrice: D(100),
            grossSales: D(100),
            discounts: D(0),
            shippingRevenue: D(0),
            tax: D(0),
            cogs: D(40),
            shippingCost: D(0),
            paymentFees: D(0),
            missingCostUnits: 0,
            lines: [],
          },
        ],
        refunds: [
          {
            orderKey: "order-1",
            localDate: refundDay,
            totalRefunded: D(20),
            returns: D(20),
            refundShipping: D(0),
            restockedCogs: D(0),
            refundedFees: D(0),
            tax: D(0),
            lines: [],
          },
        ],
        adSpend: [],
        expenses: [],
        settings: { includeTestOrders: false, excludeCancelled: true },
      });
      money(days.get(orderDay)!.returns, "0");
      money(days.get(refundDay)!.returns, "20");
      money(days.get(orderDay)!.grossSales, "100");
    }
  });

  it("(d) restocked lines reverse COGS and unstocked lines do not", () => {
    const refund = computeRefund(
      {
        totalRefunded: D(40),
        lines: [
          { lineItemGid: "a", quantity: 2, restocked: true, subtotal: D(20), tax: D(0) },
          { lineItemGid: "b", quantity: 3, restocked: false, subtotal: D(15), tax: D(0) },
        ],
        shippingLines: [],
        adjustments: [],
      },
      [
        { lineItemGid: "a", unitCostUsed: D("4.5") },
        { lineItemGid: "b", unitCostUsed: D("4.5") },
      ],
    );
    money(refund.restockedCogs, "9");
    money(refund.returns, "35");
  });

  it("(e) an order before a cost change uses the older cost", () => {
    const history = [
      { variantGid: "v1", unitCost: D(8), effectiveFrom: "2026-01-01", source: "SHOPIFY" },
      { variantGid: "v1", unitCost: D(12), effectiveFrom: "2026-06-15", source: "SHOPIFY" },
      { variantGid: "v1", unitCost: D(20), effectiveFrom: "2026-06-15", source: "MANUAL" },
    ];
    money(unitCostAt(history, "v1", "2026-06-14").unitCost!, "8");
    money(unitCostAt(history, "v1", "2026-06-15").unitCost!, "20");
    money(unitCostAt(history, "v1", "2026-01-01").unitCost!, "8");
  });

  it("(f) actual fees beat the gateway rule, and a missing rule is zero plus a warning", () => {
    const actual = paymentFees(
      [
        {
          kind: "SALE",
          status: "SUCCESS",
          gateway: "shopify_payments",
          amount: D(100),
          fees: [D("1.20")],
        },
      ],
      [{ gateway: "shopify_payments", percent: D("0.029"), fixed: D("0.30") }],
      "ACTUAL_THEN_RULE",
    );
    money(actual.amount, "1.20");
    expect(actual.actual).toBe(true);
    expect(actual.warnings).toEqual([]);

    const missing = paymentFees(
      [{ kind: "CAPTURE", status: "SUCCESS", gateway: "bogus", amount: D(50), fees: [] }],
      [],
      "ACTUAL_THEN_RULE",
    );
    money(missing.amount, "0");
    expect(missing.actual).toBe(false);
    expect(missing.warnings).toHaveLength(1);
    expect(missing.warnings[0]).toContain("bogus");
  });

  it("(g) gift card lines are excluded from revenue and COGS", () => {
    const resolver: CostResolver = () => ({ unitCost: D(10), missing: false });
    const order = computeOrder(
      {
        taxesIncluded: false,
        localDate: "2026-06-01",
        lines: [
          {
            lineItemGid: "gift",
            title: "Gift card",
            quantity: 1,
            isGiftCard: true,
            requiresShipping: false,
            originalTotal: D(50),
            discountTotal: D(0),
            taxTotal: D(0),
          },
          {
            lineItemGid: "product",
            title: "Tee",
            quantity: 2,
            isGiftCard: false,
            requiresShipping: true,
            variantGid: "v1",
            originalTotal: D(100),
            discountTotal: D(0),
            taxTotal: D(0),
          },
        ],
        shippingLines: [],
        transactions: [],
      },
      {
        feeMode: "ACTUAL_THEN_RULE",
        gatewayRules: [],
        shippingCostMode: "NONE",
        shippingFlatCost: D(0),
        shippingPercent: D(0),
        manualShippingCost: null,
      },
      resolver,
    );
    money(order.revenue, "100");
    money(order.cogs, "20");
    expect(order.lines[0].cogs.isZero()).toBe(true);
    expect(order.lines[0].missingCost).toBe(false);
  });

  it("(h) monthly expense share in February divides by 28 or 29", () => {
    expect(daysInMonth("2026-02-15")).toBe(28);
    expect(daysInMonth("2024-02-15")).toBe(29);
    money(dailyShare({ amount: D(280), frequency: "MONTHLY", startDate: "2026-01-01" }, "2026-02-15"), "10");
    money(dailyShare({ amount: D(290), frequency: "MONTHLY", startDate: "2024-01-01" }, "2024-02-15"), "10");
    money(
      dailyShare({ amount: D(280), frequency: "MONTHLY", startDate: "2026-03-01" }, "2026-02-15"),
      "0",
    );
    money(
      dailyShare(
        { amount: D(280), frequency: "MONTHLY", startDate: "2026-01-01", endDate: "2026-01-31" },
        "2026-02-15",
      ),
      "0",
    );
  });

  it("(i) ratios come from range sums, not the average of daily ratios", () => {
    const ratios = ratiosFromSums([
      { revenue: D(100), netProfit: D(50), grossProfit: D(60), adSpend: D(10) },
      { revenue: D(300), netProfit: D(0), grossProfit: D(20), adSpend: D(30) },
    ]);
    money(ratios.margin!, "0.125");
    money(ratios.mer!, "10");
    const averageOfDailyMargins = D(0.5).plus(0).div(2);
    expect(ratios.margin!.eq(averageOfDailyMargins)).toBe(false);
  });

  it("(j) a refund with only totalRefunded books that amount as returns", () => {
    const refund = computeRefund(
      {
        totalRefunded: D("42.50"),
        lines: [],
        shippingLines: [],
        adjustments: [],
      },
      [],
    );
    money(refund.returns, "42.50");
    money(refund.restockedCogs, "0");

    const withLine = computeRefund(
      {
        totalRefunded: D(80),
        lines: [{ lineItemGid: "a", quantity: 1, restocked: false, subtotal: D(20), tax: D(0) }],
        shippingLines: [],
        adjustments: [],
      },
      [],
    );
    money(withLine.returns, "20");
  });
});
