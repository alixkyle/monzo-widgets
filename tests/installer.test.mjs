import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writes = new Map();
for (const filename of [
  "Money App.js",
  "Money Week.js",
  "Money — bills & savings.js",
  "Money — pots.js",
  "Money Settings.js",
]) {
  writes.set(`/icloud/${filename}`, "legacy");
}

class AlertMock {
  constructor() {
    this.values = [];
  }

  addTextField(_placeholder, value = "") {
    this.values.push(value);
  }

  addSecureTextField(_placeholder, value = "") {
    this.values.push(value);
  }

  addAction() {}
  addCancelAction() {}

  async presentAlert() {
    if (this.title === "Install Monzo Widgets") {
      this.values = [
        "https://monzo-widgets.example.workers.dev",
        "test-widget-key",
      ];
    }
    return 0;
  }

  textFieldValue(index) {
    return this.values[index];
  }
}

class RequestMock {
  constructor(url) {
    this.url = url;
  }

  async loadJSON() {
    assert.equal(this.headers.Authorization, "Bearer test-widget-key");
    if (this.url.endsWith("/summary?dayStart=midnight")) {
      return {
        currency: "GBP",
        spentToday: 0,
        balance: 10000,
        transactions: [],
      };
    }
    if (this.url.endsWith("/week?dayStart=midnight")) {
      return { days: new Array(7).fill({ total: 0 }) };
    }
    if (this.url.endsWith("/weeks?count=4&dayStart=midnight")) {
      return { weeks: new Array(4).fill({ total: 0 }) };
    }
    if (this.url.endsWith("/pots")) {
      return { pots: [] };
    }
    assert.fail(`Unexpected readiness-check URL: ${this.url}`);
  }

  async loadString() {
    const filename = new URL(this.url).pathname.split("/").at(-1);
    return fs.readFileSync(path.join(root, "widget", filename), "utf8");
  }
}

const fileManager = {
  documentsDirectory: () => "/icloud",
  joinPath: (...parts) => path.posix.join(...parts),
  fileExists: (filename) => writes.has(filename),
  async downloadFileFromiCloud() {},
  readString: (filename) => writes.get(filename),
  writeString: (filename, contents) => writes.set(filename, contents),
  remove: (filename) => writes.delete(filename),
};

const context = vm.createContext({
  Alert: AlertMock,
  Request: RequestMock,
  FileManager: { iCloud: () => fileManager },
  Script: { complete() {} },
  URL,
  console,
});

const source = fs.readFileSync(
  path.join(root, "widget", "money-installer.js"),
  "utf8"
);
const module = new vm.SourceTextModule(source, {
  context,
  identifier: "money-installer.js",
});
await module.link(() => {
  throw new Error("The installer should not import modules");
});
await module.evaluate();

for (const filename of [
  "Monzo Today.js",
  "Monzo Spending.js",
  "Monzo Categories.js",
  "Monzo 4 Weeks.js",
  "Monzo Bills & Savings.js",
  "Monzo Balances & Pots.js",
  "Monzo Settings.js",
]) {
  assert.ok(writes.has(`/icloud/${filename}`), `${filename} was not installed`);
}

for (const filename of [
  "Money App.js",
  "Money Week.js",
  "Money — bills & savings.js",
  "Money — pots.js",
  "Money Settings.js",
]) {
  assert.ok(!writes.has(`/icloud/${filename}`), `${filename} was not removed`);
}

const settings = JSON.parse(writes.get("/icloud/money-app-settings.json"));
assert.equal(
  settings.workerUrl,
  "https://monzo-widgets.example.workers.dev"
);
assert.equal(settings.widgetKey, "test-widget-key");
assert.equal(settings.dayStart, "midnight");
assert.equal(settings.subtractFlexFromTotal, true);

console.log("Installer test passed");
