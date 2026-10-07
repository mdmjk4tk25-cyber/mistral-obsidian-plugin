import { Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { MistralClient } from "./mistral-client";
import { convertPdfWithMistralOcr } from "./ocr-converter";
import { analyzeMarkdown } from "./analyzer";

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

    try {
      let markdown: string;
      if (kind === "pdf") {
        new Notice(`Converting "${file.name}" with Mistral OCR\u2026`);
        markdown = await convertPdfWithMistralOcr(client, this.app, file);
        if (this.settings.keepOcrMarkdown) {
          const sidecar = `${file.path}.md`;
          if (!(await this.app.vault.adapter.exists(sidecar))) {
            await this.app.vault.adapter.write(sidecar, markdown);
            new Notice(`Saved OCR Markdown to ${sidecar}`);
          }
        }
      } else {
        markdown = await this.app.vault.read(file);
      }

      new Notice(`Analyzing with ${this.settings.chatModel}\u2026`);
      const page = await analyzeMarkdown(client, markdown, {
        sourceName: file.basename,
        angle: this.settings.documentAngle,
      });

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
      new Notice(`Wrote ${outPath}`);
      await this.app.workspace.openLinkText(outPath, "", false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Mistral ingest failed: ${message}`);
      console.error("Mistral ingest failed:", err);
    }
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
