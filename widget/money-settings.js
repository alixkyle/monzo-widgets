// Monzo Settings — shared widget settings (Scriptable)
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
  alert.title = "Connect Monzo Widgets";
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

async function presentOptions(title, message, actions) {
  while (true) {
    const alert = new Alert();
    alert.title = title;
    alert.message = message;
    for (const action of actions) alert.addAction(action.label());
    alert.addCancelAction("Back");

    const choice = await alert.presentSheet();
    if (choice < 0) return;

    await actions[choice].run();
    saveSettings(settings);
  }
}

async function spendingSettings() {
  await presentOptions(
    "Spending widgets",
    "These settings keep Monzo Today and Monzo Spending aligned. Bills and Savings also affect the separate chart.",
    [
      {
        label: () =>
          `Bills in Monzo Spending: ${
            settings.excludeBills ? "Excluded" : "Included"
          }`,
        run: () => (settings.excludeBills = !settings.excludeBills),
      },
      {
        label: () =>
          `Savings in Monzo Spending: ${
            settings.excludeSavings ? "Excluded" : "Included"
          }`,
        run: () => (settings.excludeSavings = !settings.excludeSavings),
      },
      {
        label: () =>
          `Flex spending: ${
            settings.includeFlexWeek ? "Included" : "Excluded"
          }`,
        run: () => (settings.includeFlexWeek = !settings.includeFlexWeek),
      },
      {
        label: () =>
          `Day starts: ${
            settings.dayStart === "midnight" ? "UK midnight" : "Monzo 04:00"
          }`,
        run: () =>
          (settings.dayStart =
            settings.dayStart === "midnight" ? "monzo" : "midnight"),
      },
    ]
  );
}

async function balanceSettings() {
  await presentOptions(
    "Balances & pots",
    "Controls the balance rows and the small Pots widget.",
    [
      {
        label: () =>
          `Subtract Flex from total: ${state(
            settings.subtractFlexFromTotal
          )}`,
        run: () =>
          (settings.subtractFlexFromTotal = !settings.subtractFlexFromTotal),
      },
      {
        label: () => `Hide £0 pots: ${state(settings.hideZeroPots)}`,
        run: () => (settings.hideZeroPots = !settings.hideZeroPots),
      },
      {
        label: () =>
          `Show Current Account: ${state(settings.showCurrentAccount)}`,
        run: () => (settings.showCurrentAccount = !settings.showCurrentAccount),
      },
      {
        label: () => `Show Flex: ${state(settings.showFlex)}`,
        run: () => (settings.showFlex = !settings.showFlex),
      },
    ]
  );
}

async function transactionSettings() {
  await presentOptions(
    "Transaction handling",
    "Advanced rules used by Monzo Today and Monzo Spending.",
    [
      {
        label: () =>
          `Bill splits: ${
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
        label: () =>
          `Other incoming money: ${
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
        label: () =>
          `Card refunds: ${
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
        label: () =>
          `Outgoing transfers: ${
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
    ]
  );
}

async function resetSettings() {
  const alert = new Alert();
  alert.title = "Reset all preferences?";
  alert.message =
    "Your Worker connection will be kept. All widget choices will return to their recommended defaults.";
  alert.addDestructiveAction("Reset preferences");
  alert.addCancelAction("Cancel");
  if ((await alert.presentAlert()) < 0) return;

  settings = {
    ...DEFAULTS,
    workerUrl: settings.workerUrl,
    widgetKey: settings.widgetKey,
  };
  saveSettings(settings);
}

while (true) {
  const alert = new Alert();
  alert.title = "Monzo Settings";
  alert.message = "Choose the part of your widgets you want to change.";
  alert.addAction("Connection");
  alert.addAction("Today & Spending");
  alert.addAction("Balances & Pots");
  alert.addAction("Advanced transaction handling");
  alert.addDestructiveAction("Reset preferences");
  alert.addCancelAction("Done");

  const choice = await alert.presentSheet();
  if (choice < 0) break;

  if (choice === 0) {
    if (await configureConnection(settings)) saveSettings(settings);
  } else if (choice === 1) {
    await spendingSettings();
  } else if (choice === 2) {
    await balanceSettings();
  } else if (choice === 3) {
    await transactionSettings();
  } else if (choice === 4) {
    await resetSettings();
  }
}

Script.complete();
