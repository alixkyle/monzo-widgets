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

// The lowest /version these widgets can work against. Raise it in step with
// WORKER_VERSION in the Worker whenever the widgets start relying on a route
// or a field that older deployments do not have.
const REQUIRED_WORKER_VERSION = 2;

/**
 * Everyone runs their own copy of the Worker and updates it on their own
 * schedule, so the widgets are often newer than the service they are calling.
 * Checking the version first turns that into one clear instruction, instead of
 * a 404 from a route that simply did not exist yet.
 *
 * Workers older than /version itself answer 404 here, which is the strongest
 * possible signal that an update is needed.
 */
async function checkWorkerVersion(workerUrl) {
  let version = 0;
  try {
    const request = new Request(`${workerUrl}/version`);
    request.timeoutInterval = 20;
    const response = await request.loadJSON();
    if (response && response.service === "monzo-widgets") {
      version = Number(response.version) || 0;
    }
  } catch {
    // Unreachable or not JSON: fall through to the out-of-date message, which
    // is the likeliest cause and does no harm if the URL is simply wrong.
    version = 0;
  }

  if (version < REQUIRED_WORKER_VERSION) {
    throw new Error(
      "Your private widget service is out of date, so the new widgets have " +
        "nothing to talk to yet.\n\n" +
        "To update it:\n" +
        "1. Open your copy of monzo-widgets on github.com\n" +
        "2. Tap Actions, then 'Sync worker from upstream'\n" +
        "3. Tap 'Run workflow'\n" +
        "4. Wait about two minutes, then run this installer again\n\n" +
        "It also updates itself once a day, so you can leave it until " +
        "tomorrow instead."
    );
  }
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

/**
 * Asks which current account to read, but only when there is a real choice.
 * Returns null when the question does not apply, or when the widget service is
 * an older deployment without /accounts — the widgets then behave as before.
 */
async function chooseAccount(workerUrl, widgetKey, currentId) {
  let accounts;
  try {
    const request = new Request(`${workerUrl}/accounts`);
    request.headers = { Authorization: `Bearer ${widgetKey}` };
    request.timeoutInterval = 20;
    accounts = (await request.loadJSON()).accounts;
  } catch {
    return null;
  }
  if (!Array.isArray(accounts) || accounts.length < 2) return null;
  if (accounts.some((account) => account.id === currentId)) return null;

  const alert = new Alert();
  alert.title = "Which Monzo account?";
  alert.message = "Your widgets will show this account. You can change it later in Monzo Settings.";
  for (const account of accounts) alert.addAction(account.label);
  alert.addCancelAction("Use the first one");

  const choice = await alert.presentSheet();
  return choice < 0 ? null : accounts[choice].id;
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

// Version first: an out-of-date Worker is the one failure with a specific,
// actionable fix, so it gets its own message rather than being buried in the
// generic "could not be verified" wording.
try {
  await checkWorkerVersion(workerUrl);
} catch (error) {
  const outOfDate = new Alert();
  outOfDate.title = "Update your widget service";
  outOfDate.message = String(error).replace(/^Error:\s*/, "");
  outOfDate.addCancelAction("OK");
  await outOfDate.presentAlert();
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

  const chosenAccount = await chooseAccount(
    workerUrl,
    widgetKey,
    existing.accountId
  );

  const settings = {
    accountId: "",
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
    ...(chosenAccount ? { accountId: chosenAccount } : {}),
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
