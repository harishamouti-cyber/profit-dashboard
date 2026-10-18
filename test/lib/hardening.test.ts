import { describe, expect, it } from "vitest";
import { parseAdSpendCsv, parseCostsCsv, parseShippingCsv } from "../../app/lib/csv";
import { marginLabel, marginTone } from "../../app/lib/profit/margin";
import { D } from "../../app/lib/money";
import { isIsoDay, localDate, safeRange } from "../../app/lib/tz";
import { acceptWebhook } from "../../app/lib/webhooks.server";

describe("input hardening", () => {
  it("rejects unknown ranges and swaps reversed dates", () => {
    const range = safeRange({ preset: "nope", from: "2026-02-30", to: "2026-01-05" }, "2026-10-18");
    expect(isIsoDay(range.from)).toBe(true);
    expect(isIsoDay(range.to)).toBe(true);
    expect(range.from <= range.to).toBe(true);
    expect(safeRange({ preset: "7d" }, "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(safeRange({ from: "2026-06-10", to: "2026-06-01" }, "2026-10-18")).toEqual({
      from: "2026-06-01",
      to: "2026-06-10",
    });
  });

  it("falls back when the shop timezone is not a real zone", () => {
    expect(localDate("2026-06-01T04:00:00.000Z", "Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(localDate("not-a-date", "UTC")).toBe("1970-01-01");
  });

  it("returns a row error instead of throwing on a broken CSV", () => {
    const broken = parseCostsCsv('"sku","unit_cost"\n"unterminated');
    expect(broken.rows).toEqual([]);
    expect(broken.errors[0]?.message).toMatch(/parsed|empty/i);
    const costs = parseCostsCsv("sku,unit_cost,effective_from\n,abc,yesterday\n");
    expect(costs.rows).toEqual([]);
    expect(costs.errors.length).toBeGreaterThan(0);
    const ads = parseAdSpendCsv("date,channel,amount\nnot-a-day,meta,12\n");
    expect(ads.errors[0]?.message).toMatch(/date/i);
    const shipping = parseShippingCsv("");
    expect(shipping.errors[0]?.message).toMatch(/empty/i);
  });

  it("labels product margins good, watch, and low", () => {
    expect(marginLabel(marginTone(D("0.5")))).toBe("Good");
    expect(marginLabel(marginTone(D("0.2")))).toBe("Watch");
    expect(marginLabel(marginTone(D("0.05")))).toBe("Low");
    expect(marginLabel(marginTone(null))).toBe("—");
  });

  it("refuses a webhook that has no id", async () => {
    const response = await acceptWebhook({
      webhookId: "",
      shop: "example.myshopify.com",
      topic: "customers/data_request",
      payload: {},
    });
    expect(response.status).toBe(400);
  });
});
