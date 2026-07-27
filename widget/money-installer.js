// Monzo Widgets — iPhone installer for Scriptable
//
// This is the only script a new user needs to add manually. It downloads the
// widgets from GitHub, verifies their Worker connection, and saves the shared
// settings in Scriptable's iCloud folder.

const RAW_BASE =
  "https://raw.githubusercontent.com/alixkyle/monzo-widgets/main/widget";

const FILES = [
  ["money-widget.js", "Monzo Today.js"],
  ["money-week.js", "Monzo Spending.js"],
  ["money-week-categories.js", "Monzo Categories.js"],
  ["money-month.js", "Monzo 4 Weeks.js"],
  ["money-bills-savings.js", "Monzo Bills & Savings.js"],
  ["money-pots.js", "Monzo Balances & Pots.js"],
  ["money-settings.js", "Monzo Settings.js"],
];

const LEGACY_FILES = [
  "Money App.js",
  "Money Week.js",
  "Money — bills & savings.js",
  "Money — pots.js",
  "Money Settings.js",
];

async function showError(message) {
  const alert = new Alert();
  alert.title = "Installation failed";
  alert.message = message;
  alert.addCancelAction("OK");
  await alert.presentAlert();
}

async function checkWorker(workerUrl, widgetKey) {
  const checks = [
    {
      name: "Monzo balance",
      path: "/summary?dayStart=midnight",
      valid: (data) =>
        typeof data.balance === "number" && Array.isArray(data.transactions),
    },
    {
      name: "Weekly spending",
      path: "/week?dayStart=midnight",
      valid: (data) => Array.isArray(data.days) && data.days.length === 7,
    },
    {
      name: "Four-week spending",
      path: "/weeks?count=4&dayStart=midnight",
      valid: (data) => Array.isArray(data.weeks) && data.weeks.length === 4,
    },
    {
      name: "Pots",
      path: "/pots",
      valid: (data) => Array.isArray(data.pots),
    },
  ];

  for (const check of checks) {
    const request = new Request(`${workerUrl}${check.path}`);
    request.headers = { Authorization: `Bearer ${widgetKey}` };
    request.timeoutInterval = 20;
    const response = await request.loadJSON();
    if (response.error) throw new Error(`${check.name}: ${response.error}`);
    if (!check.valid(response)) {
      throw new Error(`${check.name}: the response was incomplete`);
    }
  }
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
  await checkWorker(workerUrl, widgetKey);
} catch (error) {
  await showError(
    `The private widget service could not be verified.\n\n${String(error)}`
  );
  return;
}

try {
  const downloaded = [];
  for (const [source, destination] of FILES) {
    const request = new Request(`${RAW_BASE}/${source}`);
    request.timeoutInterval = 20;
    const code = await request.loadString();
    if (!code.includes("Monzo")) {
      throw new Error(`Unexpected download for ${source}`);
    }
    downloaded.push([destination, code]);
  }

  const fm = FileManager.iCloud();
  const directory = fm.documentsDirectory();

  for (const [destination, code] of downloaded) {
    fm.writeString(fm.joinPath(directory, destination), code);
  }

  // Remove the old script names only after their replacements have been saved.
  for (const legacyName of LEGACY_FILES) {
    const legacyPath = fm.joinPath(directory, legacyName);
    if (fm.fileExists(legacyPath)) fm.remove(legacyPath);
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
    splitRepayments: "original",
    unlinkedIncoming: "ignore",
    cardRefunds: "original",
    outgoingTransfers: "include",
    ...existing,
    workerUrl,
    widgetKey,
  };
  fm.writeString(settingsPath, JSON.stringify(settings, null, 2));

  for (const [, destination] of FILES) {
    const installedPath = fm.joinPath(directory, destination);
    if (!fm.fileExists(installedPath)) {
      throw new Error(`${destination} was not installed`);
    }
  }
  const savedSettings = JSON.parse(fm.readString(settingsPath));
  if (
    savedSettings.workerUrl !== workerUrl ||
    savedSettings.widgetKey !== widgetKey
  ) {
    throw new Error("The connection settings were not saved correctly");
  }

  const done = new Alert();
  done.title = "Everything is ready";
  done.message =
    "Monzo, weekly spending, four-week spending, pots, all seven scripts, and your settings passed the checks.\n\nYou can now add the widgets to the Home Screen. If you used the older Money script names, reselect each widget's new Monzo script once.";
  done.addAction("Done");
  await done.presentAlert();
} catch (error) {
  await showError(String(error));
}
}

await install();
Script.complete();
