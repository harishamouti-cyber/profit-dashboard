import { describe, expect, it } from "vitest";
import { periodDelta } from "../../app/lib/delta";
import { D } from "../../app/lib/money";

describe("periodDelta", () => {
  it("computes a normal positive and negative change", () => {
    expect(periodDelta(D(150), D(100))).toEqual({ text: "+50.0%", tone: "success" });
    expect(periodDelta(D(50), D(100))).toEqual({ text: "-50.0%", tone: "critical" });
  });

  it("does not flip sign when the previous period was a loss", () => {
    // Loss of $8.79 (only expenses) to a $6,285 profit: never a huge negative %.
    expect(periodDelta(D("6285"), D("-8.79"))).toEqual({ text: "Turned positive", tone: "success" });
    // Smaller loss is an improvement, bigger loss is worse.
    expect(periodDelta(D(-10), D(-20))).toEqual({ text: "+50.0%", tone: "success" });
    expect(periodDelta(D(-20), D(-10))).toEqual({ text: "-100.0%", tone: "critical" });
  });

  it("labels moves away from zero", () => {
    expect(periodDelta(D(0), D(0))).toEqual({ text: "0%", tone: "neutral" });
    expect(periodDelta(D(25), D(0))).toEqual({ text: "New", tone: "success" });
    expect(periodDelta(D(-25), D(0))).toEqual({ text: "New", tone: "critical" });
  });

  it("goes negative when profit turns into a loss", () => {
    expect(periodDelta(D(-50), D(100))).toEqual({ text: "-150.0%", tone: "critical" });
  });
});
