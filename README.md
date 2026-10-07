# Mistral for Obsidian

An Obsidian plugin that turns PDFs (and notes) into wiki pages using two Mistral
models in sequence:

1. **Convert** — `mistral-ocr-latest` reads the PDF via the Mistral Files API +
   OCR endpoint and returns per-page Markdown.
2. **Analyze** — your configured Mistral chat model (default
   `mistral-small-latest`) writes the wiki page: summary, key entities, key
   concepts with `[[wiki-links]]`, and a Sources section.

This is the convert-then-analyze pattern: the OCR model does the reading, the
text model does the reasoning. Neither step needs the other's capabilities.

## Setup

1. Build: `npm install && npm run build` (produces `main.js`, `manifest.json`).
2. Copy `main.js`, `manifest.json`, `styles.css` into
   `<vault>/.obsidian/plugins/mistral-obsidian-plugin/` and enable the plugin.
3. Settings → **Mistral for Obsidian** → paste your API key from
   console.mistral.ai, pick the chat model, pick the output folder.

## Commands

- **Ingest PDF with Mistral** — open a PDF, run the command. The plugin
  uploads it to Mistral, runs OCR, caches the Markdown next to the plugin data
  (content-hash keyed), then analyzes it.
- **Ingest current note** — same analysis path for plain Markdown notes.

## Progress dashboard

Every ingest opens a progress modal with four steps:

| Step | What happens |
|------|--------------|
| Upload PDF to Mistral | PDF bytes are sent to the Files API |
| OCR — convert to Markdown | `mistral-ocr-latest` returns per-page Markdown |
| Analyze — build wiki page | The chat model writes the wiki page |
| Write page to vault | The result is saved to the output folder |

Each step shows a status icon (pending / running / done / error) and a detail
line — token counts, page counts, or the output path. A cache hit skips the
first two steps and shows "Served from OCR cache" with no API cost.

## Running cost estimator

The plugin reports cost live, in the modal's **Running cost** line and in the
final Notice (`Wrote <path> — est. cost €0.012345`).

How it works:

- **Real usage, not guesses** — Mistral's API returns `prompt_tokens` /
  `completion_tokens` for chat and a page count for OCR. The plugin reads
  those numbers from every call and prices them.
- **Price table** — `src/pricing.ts` holds EUR rates per model
  (chat: per million tokens in/out; OCR: €0.0011 per page).
- **Per-run tracker** — `src/cost-tracker.ts` accumulates one entry per API
  call so the running total updates after each step.

If Mistral's prices change, update the table in `src/pricing.ts` — it is the
single place rates live. Estimates are informational, not invoices; check
console.mistral.ai for authoritative billing.

## Notes

- Uploaded files are deleted from Mistral after conversion; only the Markdown
  result is kept, in the local OCR cache.
- The "Save OCR Markdown next to PDF" toggle writes `<file>.pdf.md` beside the
  source PDF for audit and reuse.
- Never commit your API key; it lives in the vault's plugin data, not the repo.

## Development

```
npm run build   # typecheck + bundle
npm test        # vitest unit tests
```

## License

MIT — see [LICENSE](LICENSE).
