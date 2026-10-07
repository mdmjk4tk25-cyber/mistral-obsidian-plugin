import { describe, expect, it } from "vitest";
import {
  estimateChatCostEur,
  estimateOcrCostEur,
  formatCost,
} from "../pricing";
import { CostTracker } from "../cost-tracker";

describe("estimateChatCostEur", () => {
  it("prices input and output tokens at per-million rates", () => {
    // mistral-small: 0.1 in / 0.3 out per million
    const cost = estimateChatCostEur("mistral-small-latest", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.4, 9);
  });

  it("returns 0 for an unknown model", () => {
    expect(estimateChatCostEur("mystery-model", 1000, 1000)).toBe(0);
  });
});

describe("estimateOcrCostEur", () => {
  it("prices per page", () => {
    expect(estimateOcrCostEur(10)).toBeCloseTo(0.011, 9);
  });
});

describe("CostTracker", () => {
  it("accumulates chat and OCR entries into a total", () => {
    const tracker = new CostTracker();
    tracker.addChat(1_000_000, 1_000_000, "mistral-small-latest");
    tracker.addOcr(10, "mistral-ocr-latest");
    const { totalEur, entries } = tracker.summary;
    expect(totalEur).toBeCloseTo(0.411, 9);
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("chat");
    expect(entries[1].kind).toBe("ocr");
  });

  it("formats the total with the euro sign", () => {
    const tracker = new CostTracker();
    tracker.addOcr(1, "mistral-ocr-latest");
    expect(tracker.formatTotal()).toBe("\u20ac0.001100");
  });
});

describe("formatCost", () => {
  it("keeps six decimals", () => {
    expect(formatCost(0)).toBe("\u20ac0.000000");
  });
});
