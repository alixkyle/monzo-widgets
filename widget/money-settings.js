// Money App — shared widget settings (Scriptable)
//
// Run this script inside Scriptable whenever you want to change how the
// widgets calculate and display your money.

const SETTINGS_FILE = "money-app-settings.json";
const DEFAULTS = {
  workerUrl: "",
  widgetKey: "",
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
};

const fm = FileManager.iCloud();
const settingsPath = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE);

async function loadSettings() {
  try {
    if (!fm.fileExists(settingsPath)) return { ...DEFAULTS };
    await fm.downloadFileFromiCloud(settingsPath);
    return { ...DEFAULTS, ...JSON.parse(fm.readString(settingsPath)) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  fm.writeString(settingsPath, JSON.stringify(settings, null, 2));
}

function state(value) {
  return value ? "On" : "Off";
}

function cycle(current, values) {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length];
}

async function configureConnection(settings) {
  const alert = new Alert();
  alert.title = "Connect Money App";
  alert.message = "Enter the values from your Cloudflare Worker setup.";
  alert.addTextField(
    "Worker URL",
    settings.workerUrl || "https://money-app.example.workers.dev"
  );
  alert.addSecureTextField("Widget key", settings.widgetKey || "");
  alert.addAction("Save");
  alert.addCancelAction("Cancel");

  if ((await alert.presentAlert()) < 0) return false;
  settings.workerUrl = alert.textFieldValue(0).trim().replace(/\/+$/, "");
  settings.widgetKey = alert.textFieldValue(1).trim();
  return Boolean(settings.workerUrl && settings.widgetKey);
}

let settings = await loadSettings();
if (!settings.workerUrl || !settings.widgetKey) {
  if (await configureConnection(settings)) saveSettings(settings);
}

while (true) {
  const alert = new Alert();
  alert.title = "Money Settings";
  alert.message = "Changes apply to every Money App widget.";

  const actions = [
    {
      label: "Update Worker connection",
      run: () => configureConnection(settings),
    },
    {
      label: `Exclude Bills from Money Week: ${state(settings.excludeBills)}`,
      run: () => (settings.excludeBills = !settings.excludeBills),
    },
    {
      label: `Exclude Savings from Money Week: ${state(
        settings.excludeSavings
      )}`,
      run: () => (settings.excludeSavings = !settings.excludeSavings),
    },
    {
      label: `Include Flex in weekly charts: ${state(
        settings.includeFlexWeek
      )}`,
      run: () => (settings.includeFlexWeek = !settings.includeFlexWeek),
    },
    {
      label: `Day starts: ${
        settings.dayStart === "midnight" ? "Midnight" : "Monzo 04:00"
      }`,
      run: () =>
        (settings.dayStart =
          settings.dayStart === "midnight" ? "monzo" : "midnight"),
    },
    {
      label: `Subtract Flex from Total Balance: ${state(
        settings.subtractFlexFromTotal
      )}`,
      run: () =>
        (settings.subtractFlexFromTotal = !settings.subtractFlexFromTotal),
    },
    {
      label: `Hide £0 pots: ${state(settings.hideZeroPots)}`,
      run: () => (settings.hideZeroPots = !settings.hideZeroPots),
    },
    {
      label: `Show Current Account row: ${state(
        settings.showCurrentAccount
      )}`,
      run: () => (settings.showCurrentAccount = !settings.showCurrentAccount),
    },
    {
      label: `Show Flex row: ${state(settings.showFlex)}`,
      run: () => (settings.showFlex = !settings.showFlex),
    },
    {
      label: `Bill-split repayments: ${
        settings.splitRepayments === "original"
          ? "Reduce original purchase"
          : "Ignore"
      }`,
      run: () =>
        (settings.splitRepayments = cycle(settings.splitRepayments, [
          "original",
          "ignore",
        ])),
    },
    {
      label: `Other incoming payments: ${
        settings.unlinkedIncoming === "ignore"
          ? "Ignore"
          : "Reduce received day"
      }`,
      run: () =>
        (settings.unlinkedIncoming = cycle(settings.unlinkedIncoming, [
          "ignore",
          "received",
        ])),
    },
    {
      label: `Card refunds: ${
        {
          original: "Original purchase",
          received: "Refund day",
          ignore: "Ignore",
        }[settings.cardRefunds]
      }`,
      run: () =>
        (settings.cardRefunds = cycle(settings.cardRefunds, [
          "original",
          "received",
          "ignore",
        ])),
    },
    {
      label: `Outgoing transfers: ${
        {
          include: "Include",
          exclude: "Exclude",
          spending: "Spending categories only",
        }[settings.outgoingTransfers]
      }`,
      run: () =>
        (settings.outgoingTransfers = cycle(settings.outgoingTransfers, [
          "include",
          "exclude",
          "spending",
        ])),
    },
  ];

  for (const action of actions) alert.addAction(action.label);
  alert.addDestructiveAction("Reset defaults");
  alert.addCancelAction("Done");

  const choice = await alert.presentSheet();
  if (choice < 0) break;

  if (choice === actions.length) {
    settings = {
      ...DEFAULTS,
      workerUrl: settings.workerUrl,
      widgetKey: settings.widgetKey,
    };
  } else {
    await actions[choice].run();
  }
  saveSettings(settings);
}

Script.complete();
