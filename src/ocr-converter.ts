import { App, TFile } from "obsidian";
import { MistralClient } from "./mistral-client";

export const OCR_CONVERTER_VERSION = "1";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function joinOcrPages(pages: Array<{ index: number; markdown: string }>): string {
  return pages
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((p) => p.markdown.trim())
    .filter((m) => m.length > 0)
    .join("\n\n---\n\n");
}

/**
 * Converts a vault PDF to Markdown using Mistral OCR:
 *   1. Read the PDF bytes.
 *   2. Hash them for the cache key.
 *   3. Cache hit -> return (no API call, no upload).
 *   4. Miss -> upload to the Files API, run OCR, join pages,
 *      cache the result, delete the uploaded file.
 */
export async function convertPdfWithMistralOcr(
  client: MistralClient,
  app: App,
  pdfFile: TFile,
  onPhase?: (phase: "cache-hit" | "uploading" | "ocr") => void
): Promise<string> {
  const bytes = new Uint8Array(
    await app.vault.adapter.readBinary(pdfFile.path)
  );
  const hash = await sha256Hex(bytes);
  const cacheDir = `${app.vault.configDir}/plugins/mistral-obsidian-plugin/ocr-cache`;
  const cachePath = `${cacheDir}/${hash}.md`;

  if (await app.vault.adapter.exists(cachePath)) {
    onPhase?.("cache-hit");
    return app.vault.adapter.read(cachePath);
  }

  onPhase?.("uploading");
  const fileId = await client.uploadPdf(bytes, pdfFile.name);
  try {
    onPhase?.("ocr");
    const result = await client.ocrFile(fileId);
    const markdown = joinOcrPages(result.pages);

    if (!(await app.vault.adapter.exists(cacheDir))) {
      await app.vault.adapter.mkdir(cacheDir);
    }
    await app.vault.adapter.write(cachePath, markdown);
    return markdown;
  } finally {
    await client.deleteFile(fileId);
  }
}
