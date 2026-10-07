import { estimateChatCostEur, estimateOcrCostEur, formatCost } from "./pricing";

export interface CostEntry {
  kind: "chat" | "ocr";
  model: string;
  detail: string;
  eur: number;
}

export interface CostSummary {
  totalEur: number;
  entries: CostEntry[];
}

/**
 * Accumulates billable events for one ingest run.
 * The progress modal reads it after every step to refresh the display.
 */
export class CostTracker {
  private entries: CostEntry[] = [];
  private total = 0;

  addChat(inputTokens: number, outputTokens: number, model: string): void {
    const eur = estimateChatCostEur(model, inputTokens, outputTokens);
    this.entries.push({
      kind: "chat",
      model,
      detail: `${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out tokens`,
      eur,
    });
    this.total += eur;
  }

  addOcr(pageCount: number, model: string): void {
    const eur = estimateOcrCostEur(pageCount);
    this.entries.push({
      kind: "ocr",
      model,
      detail: `${pageCount} page${pageCount === 1 ? "" : "s"}`,
      eur,
    });
    this.total += eur;
  }

  get summary(): CostSummary {
    return { totalEur: this.total, entries: this.entries.slice() };
  }

  formatTotal(): string {
    return formatCost(this.total);
  }
}
