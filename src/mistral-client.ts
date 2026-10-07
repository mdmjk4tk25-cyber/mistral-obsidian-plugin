import { requestUrl } from "obsidian";

const MISTRAL_BASE = "https://api.mistral.ai/v1";

export interface OcrPage {
  index: number;
  markdown: string;
}

export interface OcrResult {
  pages: OcrPage[];
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MistralClientOptions {
  apiKey: string;
  chatModel: string;
  ocrModel: string;
}

interface RequestFailure extends Error {
  status?: number;
}

async function mistralRequest(
  path: string,
  apiKey: string,
  body: unknown
): Promise<unknown> {
  let response;
  try {
    response = await requestUrl({
      url: `${MISTRAL_BASE}${path}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      throw: false,
    });
  } catch (err) {
    const failure = err as RequestFailure;
    throw new Error(
      `Mistral request failed before reaching the API: ${failure.message}`
    );
  }
  if (response.status >= 400) {
    const detail =
      typeof response.json?.message === "string"
        ? response.json.message
        : JSON.stringify(response.json);
    throw new Error(
      `Mistral API error ${response.status} on ${path}: ${detail}`
    );
  }
  return response.json;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface OcrUsage {
  pageCount: number;
}

export class MistralClient {
  readonly chatModel: string;
  readonly ocrModel: string;
  private readonly apiKey: string;
  /** Set by the ingest controller; called after each billable API call. */
  onUsage?: (usage: ChatUsage | OcrUsage, kind: "chat" | "ocr", model: string) => void;

  private reportChatUsage(json: unknown, model: string) {
    const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    if (usage && typeof usage.prompt_tokens === "number" && typeof usage.completion_tokens === "number") {
      this.onUsage?.({ inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }, "chat", model);
    }
  }

  constructor(opts: MistralClientOptions) {
    this.apiKey = opts.apiKey;
    this.chatModel = opts.chatModel;
    this.ocrModel = opts.ocrModel;
  }

  /**
   * Runs OCR on a PDF already uploaded to the Mistral Files API.
   * Returns per-page Markdown, preserving page order.
   */
  async ocrFile(fileId: string): Promise<OcrResult> {
    const json = (await mistralRequest("/ocr", this.apiKey, {
      model: this.ocrModel,
      document: { type: "uploaded_file", file_id: fileId, name: "document.pdf" },
      include_image_base64: false,
    })) as { pages?: OcrPage[]; model?: string };
    if (!json.pages || json.pages.length === 0) {
      throw new Error("Mistral OCR returned no pages.");
    }
    this.onUsage?.({ pageCount: json.pages.length }, "ocr", json.model ?? this.ocrModel);
    return { pages: json.pages, model: json.model ?? this.ocrModel };
  }

  /** Uploads raw PDF bytes and returns the Mistral file id. */
  async uploadPdf(bytes: Uint8Array, filename: string): Promise<string> {
    const boundary = "----mistral-obsidian-" + Math.random().toString(36).slice(2);
    const preamble = `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nocr\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`;
    const epilogue = `\r\n--${boundary}--\r\n`;
    const preambleBytes = new TextEncoder().encode(preamble);
    const epilogueBytes = new TextEncoder().encode(epilogue);
    const body = new Uint8Array(
      preambleBytes.length + bytes.length + epilogueBytes.length
    );
    body.set(preambleBytes, 0);
    body.set(bytes, preambleBytes.length);
    body.set(epilogueBytes, preambleBytes.length + bytes.length);

    const response = await requestUrl({
      url: `${MISTRAL_BASE}/files`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength
      ) as ArrayBuffer,
      throw: false,
    });
    if (response.status >= 400) {
      const detail =
        typeof response.json?.message === "string"
          ? response.json.message
          : JSON.stringify(response.json);
      throw new Error(
        `Mistral file upload failed (${response.status}): ${detail}`
      );
    }
    const id = response.json?.id;
    if (typeof id !== "string" || !id) {
      throw new Error("Mistral file upload returned no file id.");
    }
    return id;
  }

  /** Deletes an uploaded file. Safe to call in a finally block. */
  async deleteFile(fileId: string): Promise<void> {
    try {
      await requestUrl({
        url: `${MISTRAL_BASE}/files/${fileId}`,
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        throw: false,
      });
    } catch {
      // Best effort only: a leftover file is not worth failing ingest.
    }
  }

  /** Non-streaming chat completion. Returns the assistant text. */
  async chat(messages: ChatMessage[], maxTokens = 4096): Promise<string> {
    const json = (await mistralRequest("/chat/completions", this.apiKey, {
      model: this.chatModel,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    })) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text) {
      throw new Error("Mistral chat returned no content.");
    }
    this.reportChatUsage(json, this.chatModel);
    return text;
  }
}
