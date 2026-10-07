export class Notice {
  constructor(public message: string) {}
}
export class Plugin {
  constructor(public app: unknown, public manifest: unknown) {}
  async loadData() {
    return {};
  }
  async saveData() {}
  addCommand() {}
  addSettingTab() {}
}
export class PluginSettingTab {
  constructor(public app: unknown, public plugin: unknown) {}
}
export class Modal {
  constructor(public app: unknown) {}
  titleEl = { setText() {} };
  contentEl = createStubEl();
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

function createStubEl() {
  const el = {
    empty() {
      return el;
    },
    createEl() {
      return createStubEl();
    },
    addClass() {},
    setText() {},
  };
  return el;
}

export class Setting {
  constructor(public containerEl: unknown) {}
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText() {}
  addDropdown() {}
  addToggle() {}
}
export async function requestUrl() {
  throw new Error("requestUrl is not available in tests");
}
