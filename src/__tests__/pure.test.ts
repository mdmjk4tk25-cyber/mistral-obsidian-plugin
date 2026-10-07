import { describe, expect, it } from "vitest";
import { buildUserPrompt, unwrapFencedMarkdown } from "../analyzer";
import { joinOcrPages } from "../ocr-converter";
import { DEFAULT_SETTINGS } from "../main";

describe("joinOcrPages", () => {
  it("joins pages in index order with a separator", () => {
    const joined = joinOcrPages([
      { index: 1, markdown: " Page two " },
      { index: 0, markdown: "Page one" },
    ]);
    expect(joined).toBe("Page one\n\n---\n\nPage two");
  });

  it("drops empty pages", () => {
    const joined = joinOcrPages([
      { index: 0, markdown: "" },
      { index: 1, markdown: "Content" },
    ]);
    expect(joined).toBe("Content");
  });
});

describe("unwrapFencedMarkdown", () => {
  it("strips a whole-output markdown fence", () => {
    expect(unwrapFencedMarkdown("```markdown\n# Title\n```")).toBe("# Title");
  });

  it("leaves clean output untouched", () => {
    expect(unwrapFencedMarkdown("# Title\n\nBody")).toBe("# Title\n\nBody");
  });
});

describe("buildUserPrompt", () => {
  it("embeds the source name, angle, and markdown", () => {
    const prompt = buildUserPrompt("report", "study notes", "# Body");
    expect(prompt).toContain('Source document: "report"');
    expect(prompt).toContain("study notes");
    expect(prompt).toContain("# Body");
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("defaults to Mistral OCR + Mistral chat with an empty key", () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe("");
    expect(DEFAULT_SETTINGS.ocrModel).toBe("mistral-ocr-latest");
    expect(DEFAULT_SETTINGS.chatModel).toBe("mistral-small-latest");
  });
});
