import { App, Modal } from "obsidian";
import { CostTracker } from "./cost-tracker";
import { formatCost } from "./pricing";

export type StepId = "upload" | "ocr" | "analyze" | "write";

export interface StepState {
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export const STEP_ORDER: StepId[] = ["upload", "ocr", "analyze", "write"];
export const STEP_LABELS: Record<StepId, string> = {
  upload: "Upload PDF to Mistral",
  ocr: "OCR \u2014 convert to Markdown",
  analyze: "Analyze \u2014 build wiki page",
  write: "Write page to vault",
};

const STATUS_ICON: Record<StepState["status"], string> = {
  pending: "\u25cb",
  running: "\u25b6",
  done: "\u2713",
  error: "\u2717",
};

/**
 * Non-blocking progress dashboard. Ingest updates step states and the
 * running-cost line via update(); the modal re-renders in place.
 */
export class ProgressModal extends Modal {
  private steps: Record<StepId, StepState>;
  private onCloseExtra: () => void;

  constructor(
    app: App,
    private sourceName: string,
    private tracker: CostTracker,
    onCloseExtra: () => void
  ) {
    super(app);
    this.onCloseExtra = onCloseExtra;
    this.steps = {
      upload: { status: "pending" },
      ocr: { status: "pending" },
      analyze: { status: "pending" },
      write: { status: "pending" },
    };
  }

  onOpen() {
    this.titleEl.setText(`Mistral ingest \u2014 ${this.sourceName}`);
    this.render();
  }

  update(step: StepId, state: Partial<StepState>) {
    this.steps[step] = { ...this.steps[step], ...state };
    this.render();
  }

  isStepRunning(step: StepId): boolean {
    return this.steps[step].status === "running";
  }

  private render() {
    this.contentEl.empty();
    const root = this.contentEl;
    const list = root.createEl("ul");
    list.addClass("mistral-progress-list");
    for (const id of STEP_ORDER) {
      const step = this.steps[id];
      const item = list.createEl("li");
      item.addClass(`mistral-step-${step.status}`);
      item.setText(`${STATUS_ICON[step.status]}  ${STEP_LABELS[id]}`);
      if (step.detail) {
        item.createEl("div").setText(step.detail);
      }
    }
    const cost = root.createEl("p");
    cost.addClass("mistral-cost-line");
    cost.setText(`Running cost: ${formatCost(this.tracker.summary.totalEur)}`);
  }

  onClose() {
    this.onCloseExtra();
  }
}
