import { Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { MistralClient } from "./mistral-client";
import { convertPdfWithMistralOcr } from "./ocr-converter";
import { analyzeMarkdown } from "./analyzer";
import { CostTracker } from "./cost-tracker";
import { ProgressModal } from "./progress-modal";

export interface MistralPluginSettings {
  apiKey: string;
  chatModel: string;
  ocrModel: string;
  outputFolder: string;
  documentAngle: string;
  keepOcrMarkdown: boolean;
}

export const DEFAULT_SETTINGS: MistralPluginSettings = {
  apiKey: "",
  chatModel: "mistral-small-latest",
  ocrModel: "mistral-ocr-latest",
  outputFolder: "Mistral wiki",
  documentAngle: "neutral, faithful to the source",
  keepOcrMarkdown: false,
};

export class MistralWikiPlugin extends Plugin {
  settings!: MistralPluginSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "ingest-pdf",
      name: "Ingest PDF with Mistral (OCR convert, then analyze)",
      callback: () => this.ingestActiveFile("pdf"),
    });

    this.addCommand({
      id: "ingest-note",
      name: "Ingest current note with Mistral",
      callback: () => this.ingestActiveFile("note"),
    });

    this.addSettingTab(new MistralSettingTab(this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async ingestActiveFile(kind: "pdf" | "note") {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice(kind === "pdf" ? "Open a PDF first." : "Open a note first.");
      return;
    }
    if (kind === "pdf" && file.extension.toLowerCase() !== "pdf") {
      new Notice("The active file is not a PDF.");
      return;
    }
    if (kind === "note" && file.extension.toLowerCase() !== "md") {
      new Notice("The active file is not a Markdown note.");
      return;
    }
    if (!this.settings.apiKey) {
      new Notice("Set your Mistral API key in Settings first.");
      return;
    }

    const client = new MistralClient({
      apiKey: this.settings.apiKey,
      chatModel: this.settings.chatModel,
      ocrModel: this.settings.ocrModel,
    });
    const tracker = new CostTracker();
    client.onUsage = (usage, kindOfCall, model) => {
      if (kindOfCall === "chat" && "inputTokens" in usage) {
        tracker.addChat(usage.inputTokens, usage.outputTokens, model);
      } else if (kindOfCall === "ocr" && "pageCount" in usage) {
        tracker.addOcr(usage.pageCount, model);
      }
    };

    const modal = new ProgressModal(this.app, file.name, tracker, () => {});
    modal.open();

    try {
      let markdown: string;
      if (kind === "pdf") {
        if (!(await this.hasOcrCache(file))) {
          modal.update("upload", { status: "running" });
        }
        markdown = await convertPdfWithMistralOcr(client, this.app, file, (phase) => {
          if (phase === "uploading") {
            modal.update("upload", { status: "running", detail: "Sending PDF bytes\u2026" });
          } else if (phase === "ocr") {
            modal.update("upload", { status: "done" });
            modal.update("ocr", { status: "running", detail: `Running ${this.settings.ocrModel}\u2026` });
          }
        });
        const ocrEntry = tracker.summary.entries.find((e) => e.kind === "ocr");
        if (ocrEntry) {
          modal.update("ocr", { status: "done", detail: ocrEntry.detail });
        } else {
          modal.update("upload", { status: "done", detail: "Cache hit \u2014 no upload needed" });
          modal.update("ocr", { status: "done", detail: "Served from OCR cache" });
        }
        if (this.settings.keepOcrMarkdown) {
          const sidecar = `${file.path}.md`;
          if (!(await this.app.vault.adapter.exists(sidecar))) {
            await this.app.vault.adapter.write(sidecar, markdown);
            new Notice(`Saved OCR Markdown to ${sidecar}`);
          }
        }
      } else {
        modal.update("upload", { status: "done", detail: "Not a PDF \u2014 skipped" });
        modal.update("ocr", { status: "done", detail: "Not a PDF \u2014 skipped" });
        markdown = await this.app.vault.read(file);
      }

      modal.update("analyze", { status: "running", detail: `Running ${this.settings.chatModel}\u2026` });
      const page = await analyzeMarkdown(client, markdown, {
        sourceName: file.basename,
        angle: this.settings.documentAngle,
      });
      const chatEntry = [...tracker.summary.entries].reverse().find((e) => e.kind === "chat");
      modal.update("analyze", {
        status: "done",
        detail: chatEntry ? chatEntry.detail : "Done",
      });

      modal.update("write", { status: "running" });
      const folder = this.settings.outputFolder;
      if (!(await this.app.vault.adapter.exists(folder))) {
        await this.app.vault.createFolder(folder);
      }
      const outPath = `${folder}/${file.basename}.md`;
      const existing = this.app.vault.getAbstractFileByPath(outPath);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, page);
      } else {
        await this.app.vault.create(outPath, page);
      }
      modal.update("write", { status: "done", detail: outPath });
      await this.app.workspace.openLinkText(outPath, "", false);
      new Notice(`Wrote ${outPath} \u2014 est. cost ${tracker.formatTotal()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = (["upload", "ocr", "analyze", "write"] as const).find(
        (id) => modal.isStepRunning(id)
      );
      if (failed) modal.update(failed, { status: "error", detail: message });
      new Notice(`Mistral ingest failed: ${message}`);
      console.error("Mistral ingest failed:", err);
    }
  }

  private async hasOcrCache(file: TFile): Promise<boolean> {
    try {
      const bytes = new Uint8Array(await this.app.vault.adapter.readBinary(file.path));
      const digest = await this.hashBytes(bytes);
      const cacheDir = `${this.app.vault.configDir}/plugins/mistral-obsidian-plugin/ocr-cache`;
      return this.app.vault.adapter.exists(`${cacheDir}/${digest}.md`);
    } catch {
      return false;
    }
  }

  private async hashBytes(bytes: Uint8Array): Promise<string> {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const digest = await crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

class MistralSettingTab extends PluginSettingTab {
  constructor(private plugin: MistralWikiPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Mistral API key")
      .setDesc("From console.mistral.ai. Stored locally in this vault.")
      .addText((text) =>
        text
          .setPlaceholder("API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Analysis model (chat)")
      .setDesc("Used for entity/concept extraction and the wiki page text.")
      .addDropdown((drop) =>
        drop
          .addOptions({
            "mistral-small-latest": "mistral-small-latest",
            "mistral-medium-latest": "mistral-medium-latest",
            "mistral-large-latest": "mistral-large-latest",
            "open-mistral-nemo": "open-mistral-nemo",
          })
          .setValue(this.plugin.settings.chatModel)
          .onChange(async (value) => {
            this.plugin.settings.chatModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("OCR model")
      .setDesc("Converts PDF pages to Markdown before analysis.")
      .addDropdown((drop) =>
        drop
          .addOptions({ "mistral-ocr-latest": "mistral-ocr-latest" })
          .setValue(this.plugin.settings.ocrModel)
          .onChange(async (value) => {
            this.plugin.settings.ocrModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Wiki pages are written here.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim() || "Mistral wiki";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Document angle")
      .setDesc("Tone for the generated page, e.g. 'neutral summary' or 'study notes'.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.documentAngle)
          .onChange(async (value) => {
            this.plugin.settings.documentAngle = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Save OCR Markdown next to PDF")
      .setDesc("Writes <file>.pdf.md beside the source for reuse and audit.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.keepOcrMarkdown)
          .onChange(async (value) => {
            this.plugin.settings.keepOcrMarkdown = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
