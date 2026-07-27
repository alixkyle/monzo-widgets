import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LEGACY_FILES = [
  "Money App.js",
  "Money Week.js",
  "Money — bills & savings.js",
  "Money — pots.js",
  "Money Settings.js",
];

const INSTALLED_FILES = [
  "Monzo Today.js",
  "Monzo Spending.js",
  "Monzo Categories.js",
  "Monzo 4 Weeks.js",
  "Monzo Bills & Savings.js",
  "Monzo Balances & Pots.js",
  "Monzo Settings.js",
];

/**
 * Runs the installer against a fake Worker.
 *
 * `workerVersion` of 0 stands for a deployment predating /version, which
 * answers 404 there — the situation every user is in until their Worker syncs.
 */
async function runInstaller({ workerVersion }) {
  const writes = new Map();
  for (const filename of LEGACY_FILES) {
    writes.set(`/icloud/${filename}`, "legacy");
  }
  const alerts = [];

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
    addDestructiveAction() {}

    async presentAlert() {
      alerts.push({ title: this.title, message: this.message });
      if (this.title === "Install Monzo Widgets") {
        this.values = [
          "https://monzo-widgets.example.workers.dev",
          "test-widget-key",
        ];
      }
      return 0;
    }

    async presentSheet() {
      alerts.push({ title: this.title, message: this.message });
      return -1;
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
      // /version is deliberately fetched without a key, so the auth assertion
      // below must not apply to it.
      if (this.url.endsWith("/version")) {
        if (workerVersion === 0) return { error: "Not found" };
        return { service: "monzo-widgets", version: workerVersion };
      }

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
      if (this.url.endsWith("/accounts")) {
        return { accounts: [] };
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

  return { writes, alerts };
}

test("a current Worker installs every script and saves the settings", async () => {
  const { writes } = await runInstaller({ workerVersion: 2 });

  for (const filename of INSTALLED_FILES) {
    assert.ok(
      writes.has(`/icloud/${filename}`),
      `${filename} was not installed`
    );
  }

  for (const filename of LEGACY_FILES) {
    assert.ok(!writes.has(`/icloud/${filename}`), `${filename} was not removed`);
  }

  const settings = JSON.parse(writes.get("/icloud/money-app-settings.json"));
  assert.equal(settings.workerUrl, "https://monzo-widgets.example.workers.dev");
  assert.equal(settings.widgetKey, "test-widget-key");
  assert.equal(settings.dayStart, "midnight");
  assert.equal(settings.subtractFlexFromTotal, true);
});

test("an out-of-date Worker is named as the problem, with the fix", async () => {
  const { alerts } = await runInstaller({ workerVersion: 0 });

  const update = alerts.find((a) => a.title === "Update your widget service");
  assert.ok(update, "the out-of-date Worker was not reported");
  assert.match(update.message, /out of date/i);
  // The message has to carry the actual remedy, not just the diagnosis.
  assert.match(update.message, /Sync worker from upstream/);
});

test("an out-of-date Worker installs nothing and leaves the old scripts alone", async () => {
  const { writes } = await runInstaller({ workerVersion: 0 });

  for (const filename of INSTALLED_FILES) {
    assert.ok(
      !writes.has(`/icloud/${filename}`),
      `${filename} was installed against a Worker that cannot serve it`
    );
  }
  // Aborting must not strand the user with nothing: their working setup stays.
  for (const filename of LEGACY_FILES) {
    assert.ok(
      writes.has(`/icloud/${filename}`),
      `${filename} was removed despite the install being abandoned`
    );
  }
  assert.ok(!writes.has("/icloud/money-app-settings.json"));
});

test("a Worker newer than the widgets is still accepted", async () => {
  const { writes } = await runInstaller({ workerVersion: 99 });
  assert.ok(writes.has("/icloud/Monzo 4 Weeks.js"));
});
