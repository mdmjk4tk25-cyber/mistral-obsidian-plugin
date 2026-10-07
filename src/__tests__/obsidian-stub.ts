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
