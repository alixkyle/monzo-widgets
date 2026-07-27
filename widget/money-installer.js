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
  let response;
  try {
    const request = new Request(`${workerUrl}/version`);
    request.timeoutInterval = 20;
    response = await request.loadJSON();
  } catch {
    // Nothing answered at all. Blaming the Worker here sends people off to
    // update a service that is fine, when the address is what is wrong — and
    // the commonest mistake is dropping the name before the first dot.
    const unreachable = new Error(
      `Nothing answered at ${workerUrl}\n\n` +
        "Check the address. It should look like\n" +
        "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev\n\n" +
        "including the part before the first dot. You can copy it from the " +
        "page you set the widgets up on."
    );
    unreachable.title = "Check the address";
    throw unreachable;
  }

  if (response && response.service === "monzo-widgets") {
    version = Number(response.version) || 0;
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

// Scriptable owns these three lines and rewrites them on save, so they must
// survive an update or the script loses its icon on every run.
const SCRIPTABLE_HEADER =
  /^\/\/ Variables used by Scriptable\.\n\/\/ These must be at the very top of the file\. Do not edit\.\n\/\/ icon-[^\n]*\n/;

function splitHeader(code) {
  const match = code.match(SCRIPTABLE_HEADER);
  return match ? [match[0], code.slice(match[0].length)] : ["", code];
}

/**
 * Replaces this script with the current one from GitHub.
 *
 * The installer updates every widget but nothing updates the installer, so a
 * copy saved before a widget existed installs everything except that widget —
 * successfully, and with no hint that anything is missing. Updating itself
 * first is the only way that self-corrects.
 *
 * Returns true when it rewrote itself, meaning the code now on disk is not the
 * code currently running and the user has to run it once more.
 */
async function updateSelf() {
  let latest;
  try {
    const request = new Request(`${RAW_BASE}/money-installer.js`);
    request.timeoutInterval = 20;
    latest = await request.loadString();
  } catch {
    return false;
  }
  // Never overwrite a working installer with a truncated or wrong download.
  if (!latest || !latest.includes("REQUIRED_WORKER_VERSION")) return false;

  try {
    const fm = FileManager.iCloud();
    const own = fm.joinPath(fm.documentsDirectory(), `${Script.name()}.js`);
    if (!fm.fileExists(own)) return false;
    await fm.downloadFileFromiCloud(own);
    const [header, current] = splitHeader(fm.readString(own));
    if (current === latest) return false;
    fm.writeString(own, header + latest);
    return true;
  } catch {
    return false;
  }
}

/** Whatever the last successful install saved, so nothing has to be retyped. */
async function readSavedSettings() {
  try {
    const fm = FileManager.iCloud();
    const path = fm.joinPath(
      fm.documentsDirectory(),
      "money-app-settings.json"
    );
    if (!fm.fileExists(path)) return {};
    await fm.downloadFileFromiCloud(path);
    return JSON.parse(fm.readString(path)) || {};
  } catch {
    return {};
  }
}

async function install() {
if (await updateSelf()) {
  const updated = new Alert();
  updated.title = "Installer updated";
  updated.message =
    "This installer was out of date and has just updated itself.\n\nTap Run again to install the current set of widgets.";
  updated.addCancelAction("OK");
  await updated.presentAlert();
  return;
}

const saved = await readSavedSettings();

const connection = new Alert();
connection.title = "Install Monzo Widgets";
connection.message = saved.workerUrl
  ? "Check these are still right, then install. Your existing widgets will be updated."
  : "Enter the values from your Cloudflare setup. Existing Money widget scripts will be updated.";
// Prefilled from the last install: retyping the address by hand is how the
// wrong one gets entered, and a wrong address is hard to tell from a broken
// service. The placeholder still shows the shape for a first-time setup.
connection.addTextField(
  "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev",
  saved.workerUrl || ""
);
connection.addSecureTextField("Widget key", saved.widgetKey || "");
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
  outOfDate.title = error.title || "Update your widget service";
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
  const existing = saved;

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
