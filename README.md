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
2. Copy `main.js`, `manifest.json` into
   `<vault>/.obsidian/plugins/mistral-obsidian-plugin/` and enable the plugin.
3. Settings → **Mistral for Obsidian** → paste your API key from
   console.mistral.ai, pick the chat model, pick the output folder.

## Commands

- **Ingest PDF with Mistral** — open a PDF, run the command. The plugin
  uploads it to Mistral, runs OCR, caches the Markdown next to the plugin data
  (content-hash keyed), then analyzes it.
- **Ingest current note** — same analysis path for plain Markdown notes.

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
