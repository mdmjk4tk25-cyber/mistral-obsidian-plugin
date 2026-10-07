/**
 * Price table in EUR per million tokens, per model.
 * Mistral pricing can change; users can override any entry in Settings.
 * Source: console.mistral.ai pricing page, snapshot. Verify before invoicing.
 */
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** OCR is priced per page, not per token. */
export const OCR_PRICE_PER_PAGE_EUR = 0.0011;

export const MODEL_PRICES_EUR: Record<string, ModelPrice> = {
  "mistral-small-latest": { inputPerMillion: 0.1, outputPerMillion: 0.3 },
  "mistral-medium-latest": { inputPerMillion: 0.4, outputPerMillion: 2 },
  "mistral-large-latest": { inputPerMillion: 2, outputPerMillion: 6 },
  "open-mistral-nemo": { inputPerMillion: 0.15, outputPerMillion: 0.15 },
};

export function lookupPrice(model: string): ModelPrice | undefined {
  return MODEL_PRICES_EUR[model];
}

export function estimateChatCostEur(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = MODEL_PRICES_EUR[model];
  if (!price) return 0;
  return (
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion
  );
}

export function estimateOcrCostEur(pageCount: number): number {
  return pageCount * OCR_PRICE_PER_PAGE_EUR;
}

/** Sane display formatting: micro amounts show as €0.000123. */
export function formatCost(eur: number): string {
  return `\u20ac${eur.toFixed(6)}`;
}
