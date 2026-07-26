// Monzo Widgets — iPhone installer for Scriptable
//
// This is the only script a new user needs to add manually. It downloads the
// widgets from GitHub, verifies their Worker connection, and saves the shared
// settings in Scriptable's iCloud folder.

const RAW_BASE =
  "https://raw.githubusercontent.com/alixkyle/monzo-widgets/main/widget";

const FILES = [
  ["money-widget.js", "Money App.js"],
  ["money-week.js", "Money Week.js"],
  ["money-bills-savings.js", "Money — bills & savings.js"],
  ["money-pots.js", "Money — pots.js"],
  ["money-settings.js", "Money Settings.js"],
];

async function showError(message) {
  const alert = new Alert();
  alert.title = "Installation failed";
  alert.message = message;
  alert.addCancelAction("OK");
  await alert.presentAlert();
}

async function install() {
const connection = new Alert();
connection.title = "Install Monzo Widgets";
connection.message =
  "Enter the values from your Cloudflare setup. Existing Money widget scripts will be updated.";
connection.addTextField(
  "Worker URL",
  "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev"
);
connection.addSecureTextField("Widget key", "");
connection.addAction("Verify and install");
connection.addCancelAction("Cancel");

if ((await connection.presentAlert()) < 0) {
  return;
}

const workerUrl = connection.textFieldValue(0).trim().replace(/\/+$/, "");
const widgetKey = connection.textFieldValue(1).trim();

if (!/^https:\/\/[^/]+\.workers\.dev$/i.test(workerUrl) || !widgetKey) {
  await showError("Enter the full HTTPS workers.dev URL and your widget key.");
  return;
}

try {
  const check = new Request(`${workerUrl}/summary?dayStart=midnight`);
  check.headers = { Authorization: `Bearer ${widgetKey}` };
  check.timeoutInterval = 20;
  const response = await check.loadJSON();
  if (response.error) throw new Error(response.error);
} catch (error) {
  await showError(
    `The Worker connection could not be verified.\n\n${String(error)}`
  );
  return;
}

try {
  const downloaded = [];
  for (const [source, destination] of FILES) {
    const request = new Request(`${RAW_BASE}/${source}`);
    request.timeoutInterval = 20;
    const code = await request.loadString();
    if (!code.includes("Money App") && !code.includes("Money Settings")) {
      throw new Error(`Unexpected download for ${source}`);
    }
    downloaded.push([destination, code]);
  }

  const fm = FileManager.iCloud();
  const directory = fm.documentsDirectory();

  for (const [destination, code] of downloaded) {
    fm.writeString(fm.joinPath(directory, destination), code);
  }

  const settingsPath = fm.joinPath(directory, "money-app-settings.json");
  let existing = {};
  try {
    if (fm.fileExists(settingsPath)) {
      await fm.downloadFileFromiCloud(settingsPath);
      existing = JSON.parse(fm.readString(settingsPath));
    }
  } catch {
    existing = {};
  }

  const settings = {
    excludeBills: true,
    excludeSavings: true,
    includeFlexWeek: true,
    dayStart: "midnight",
    subtractFlexFromTotal: true,
    hideZeroPots: true,
    showCurrentAccount: true,
    showFlex: true,
    ...existing,
    workerUrl,
    widgetKey,
  };
  fm.writeString(settingsPath, JSON.stringify(settings, null, 2));

  const done = new Alert();
  done.title = "Monzo Widgets installed";
  done.message =
    "Run Money Settings to review your choices, then add the four widgets from the Home Screen.";
  done.addAction("Done");
  await done.presentAlert();
} catch (error) {
  await showError(String(error));
}
}

await install();
Script.complete();
