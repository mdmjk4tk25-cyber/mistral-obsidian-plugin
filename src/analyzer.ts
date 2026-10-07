import { MistralClient } from "./mistral-client";

export interface AnalyzeOptions {
  sourceName: string;
  angle: string;
}

const SYSTEM_PROMPT = `You are a knowledge-base editor inside Obsidian.
You receive the Markdown text of one source document and write ONE wiki page from it.
Rules:
- Output Markdown only. No code fences around the whole output.
- Start with a H1 title, then a summary section.
- Extract entities (people, orgs, products, events) and concepts (theories, methods, terms).
- Write a "## Key entities" and a "## Key concepts" section; each item is a bullet with a one-line definition.
- Where an entity or concept deserves its own page, link it as [[Wiki-Page-Name]].
- Add a "## Sources" section that names the source document.
- Keep the source language. Do not translate.`;

const USER_TEMPLATE = `Source document: "{sourceName}".
Write the wiki page with this angle: {angle}.

Source Markdown:
---
{markdown}
---`;

export function buildUserPrompt(
  sourceName: string,
  angle: string,
  markdown: string
): string {
  return USER_TEMPLATE.replace("{sourceName}", sourceName)
    .replace("{angle}", angle)
    .replace("{markdown}", markdown);
}

export function unwrapFencedMarkdown(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

export async function analyzeMarkdown(
  client: MistralClient,
  markdown: string,
  opts: AnalyzeOptions
): Promise<string> {
  const user = buildUserPrompt(opts.sourceName, opts.angle, markdown);
  const raw = await client.chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    4096
  );
  return unwrapFencedMarkdown(raw);
}
