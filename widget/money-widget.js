// Monzo Today — iOS home screen widget (Scriptable)
//
// Setup: copy this file into Scriptable on your iPhone, fill in the two values
// below, then add a Scriptable widget to your home screen and pick this script.
// See SETUP.md for the full walkthrough.
//
// This one also keeps the whole set of widgets up to date — see
// refreshWidgetScripts below.

const WORKER_URL = "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev";
const WIDGET_KEY = "PASTE_YOUR_WIDGET_KEY";

// ---------------------------------------------------------------------------

// Monzo's brand palette: hot coral on deep navy, with soft white text.
// Their hero typeface (Oldschool Grotesk) isn't available to Scriptable, so
// heavy system weights stand in for it.
const COLORS = {
  bg: new Color("#001E3A"),
  coral: new Color("#FF4F40"),
  text: new Color("#F7F5F2"),
  dim: new Color("#8FA3B8"),
  green: new Color("#4BB78F"),
  rule: new Color("#245F8C"),
};

// Keeping every widget up to date is one download loop, so the widget that is
// always on a home screen carries it for the whole set. The installer stays the
// manual fallback; this is what saves you having to ask someone else to run it.
//
// It runs after the widget has been handed to iOS, never before, so a slow or
// failed download costs nothing on screen.
const UPDATE_SOURCE =
  "https://raw.githubusercontent.com/alixkyle/monzo-widgets/main/widget";

// Mirrors FILES in money-installer.js: repository name, then the script name
// Scriptable shows. Add new widgets to both.
const UPDATE_FILES = [
  ["money-widget.js", "Monzo Today.js"],
  ["money-week.js", "Monzo Spending.js"],
  ["money-week-categories.js", "Monzo Categories.js"],
  ["money-month.js", "Monzo 4 Weeks.js"],
  ["money-bills-savings.js", "Monzo Bills & Savings.js"],
  ["money-pots.js", "Monzo Balances & Pots.js"],
  ["money-settings.js", "Monzo Settings.js"],
];

const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000;
const UPDATE_MARKER = "money-update-check.txt";

// Scriptable owns these three lines and rewrites them on save, so they have to
// survive an update or a script loses its icon.
const SCRIPTABLE_HEADER =
  /^\/\/ Variables used by Scriptable\.\n\/\/ These must be at the very top of the file\. Do not edit\.\n\/\/ icon-[^\n]*\n/;

/**
 * Downloads the current widgets over the installed ones, once a day.
 *
 * The copy running right now has already been loaded, so rewriting it here
 * takes effect on the next refresh rather than this one — which is why this is
 * worth doing at all: nobody has to be told to press anything.
 */
async function refreshWidgetScripts() {
  const fm = FileManager.iCloud();
  const directory = fm.documentsDirectory();
  const marker = fm.joinPath(directory, UPDATE_MARKER);

  if (fm.fileExists(marker)) {
    await fm.downloadFileFromiCloud(marker);
    const last = Number(fm.readString(marker));
    if (Number.isFinite(last) && Date.now() - last < UPDATE_EVERY_MS) return;
  }

  // Written before the downloads, not after: a source that always fails would
  // otherwise be retried on every single widget refresh, all day.
  fm.writeString(marker, String(Date.now()));

  for (const [source, destination] of UPDATE_FILES) {
    const request = new Request(`${UPDATE_SOURCE}/${source}`);
    request.timeoutInterval = 20;
    const code = await request.loadString();

    // The installer's guard: never overwrite a working widget with a truncated
    // or unexpected download.
    if (!code || !code.includes("Monzo")) continue;

    const path = fm.joinPath(directory, destination);
    let header = "";
    if (fm.fileExists(path)) {
      await fm.downloadFileFromiCloud(path);
      const current = fm.readString(path);
      const match = current.match(SCRIPTABLE_HEADER);
      header = match ? match[0] : "";
      if (current.slice(header.length) === code) continue;
    }
    fm.writeString(path, header + code);
  }
}

async function loadWidgetSettings() {
  const defaults = {
    workerUrl: "",
    widgetKey: "",
    accountId: "",
    excludeBills: true,
    excludeSavings: true,
    includeFlexWeek: true,
    dayStart: "midnight",
    splitRepayments: "original",
    unlinkedIncoming: "ignore",
    cardRefunds: "original",
    outgoingTransfers: "include",
  };
  try {
    const fm = FileManager.iCloud();
    const path = fm.joinPath(
      fm.documentsDirectory(),
      "money-app-settings.json"
    );
    if (!fm.fileExists(path)) return defaults;
    await fm.downloadFileFromiCloud(path);
    return { ...defaults, ...JSON.parse(fm.readString(path)) };
  } catch {
    return defaults;
  }
}

const SETTINGS = await loadWidgetSettings();

async function loadJSON(url, widgetKey) {
  const req = new Request(url);
  // Sent as a header rather than in the URL, so the key stays out of logs.
  req.headers = { Authorization: `Bearer ${widgetKey}` };
  req.timeoutInterval = 15;
  return req.loadJSON();
}

async function fetchMoneyData() {
  const workerUrl = SETTINGS.workerUrl || WORKER_URL;
  const widgetKey = SETTINGS.widgetKey || WIDGET_KEY;
  const excluded = [];
  if (SETTINGS.excludeBills) excluded.push("bills");
  if (SETTINGS.excludeSavings) excluded.push("savings");
  const weekQuery = [
    "weeks=0",
    `exclude=${encodeURIComponent(excluded.join(","))}`,
    `includeFlex=${SETTINGS.includeFlexWeek}`,
    `dayStart=${encodeURIComponent(SETTINGS.dayStart)}`,
    `splitRepayments=${encodeURIComponent(SETTINGS.splitRepayments)}`,
    `unlinkedIncoming=${encodeURIComponent(SETTINGS.unlinkedIncoming)}`,
    `cardRefunds=${encodeURIComponent(SETTINGS.cardRefunds)}`,
    `outgoingTransfers=${encodeURIComponent(SETTINGS.outgoingTransfers)}`,
    `account=${encodeURIComponent(SETTINGS.accountId)}`,
  ].join("&");

  // Use Monzo Spending as the single source of truth for today's spending total.
  const week = await loadJSON(`${workerUrl}/week?${weekQuery}`, widgetKey);
  const summary = await loadJSON(
    `${workerUrl}/summary?dayStart=${encodeURIComponent(SETTINGS.dayStart)}` +
      `&account=${encodeURIComponent(SETTINGS.accountId)}`,
    widgetKey
  );
  const today = week.days?.[week.days.length - 1];
  if (today) summary.spentToday = today.total;
  return summary;
}

/** Monzo returns minor units; spending is negative, so flip it for display. */
function money(minorUnits, currency = "GBP") {
  const symbol = currency === "GBP" ? "£" : "";
  const value = Math.abs(minorUnits) / 100;
  return `${symbol}${value.toFixed(2)}`;
}

/** A short coral rule, standing in for the brand mark. */
function accentBar(width) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, 3);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(COLORS.coral);
  ctx.fillRect(new Rect(0, 0, width, 3));
  return ctx.getImage();
}

function buildWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(14, 16, 14, 16);

  w.addImage(accentBar(28)).imageSize = new Size(28, 3);
  w.addSpacer(8);

  const label = w.addText("SPENT TODAY");
  label.font = Font.semiboldSystemFont(10);
  label.textColor = COLORS.dim;

  w.addSpacer(4);

  // A small widget only has about 110pt of width, which four figures and pence
  // overflow at 36pt — iOS then truncates it to "£14…" rather than shrinking
  // it, so start smaller there and let it scale down further if it has to.
  const small = config.widgetFamily === "small";
  const total = w.addText(money(data.spentToday, data.currency));
  total.font = Font.heavySystemFont(small ? 30 : 36);
  total.textColor = COLORS.text;
  total.lineLimit = 1;
  total.minimumScaleFactor = 0.5;

  w.addSpacer(2);

  const balances = w.addStack();
  balances.layoutVertically();

  const balance = balances.addText(`${money(data.balance, data.currency)} left`);
  balance.font = Font.mediumSystemFont(12);
  balance.textColor = COLORS.green;
  balance.lineLimit = 1;
  balance.minimumScaleFactor = 0.75;

  if (data.flex) {
    balances.addSpacer(2);
    // Flex runs negative because it's a debt; show the amount owed.
    const flex = balances.addText(
      `Flex −${money(data.flex.balance, data.currency)}`
    );
    flex.font = Font.mediumSystemFont(12);
    flex.textColor = COLORS.coral;
    flex.lineLimit = 1;
    flex.minimumScaleFactor = 0.75;
  }

  // Small widgets have no room for a transaction list.
  const rows = small ? 0 : 3;
  if (rows > 0 && data.transactions.length > 0) {
    w.addSpacer(10);
    for (const tx of data.transactions.slice(0, rows)) {
      const row = w.addStack();
      row.layoutHorizontally();

      const name = row.addText(tx.name);
      name.font = Font.systemFont(12);
      name.textColor = COLORS.text;
      name.lineLimit = 1;

      row.addSpacer();

      // Positive amounts are money in, so highlight them differently.
      const amt = row.addText(money(tx.amount, data.currency));
      amt.font = Font.semiboldSystemFont(12);
      amt.textColor = tx.amount > 0 ? COLORS.green : COLORS.text;

      w.addSpacer(4);
    }
  }

  w.addSpacer();

  const updated = w.addText(
    `Updated ${new Date(data.updatedAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })}`
  );
  updated.font = Font.systemFont(9);
  updated.textColor = COLORS.dim;

  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  const t = w.addText("Monzo Today");
  t.font = Font.heavySystemFont(14);
  t.textColor = COLORS.coral;
  w.addSpacer(4);
  const m = w.addText(message);
  m.font = Font.systemFont(10);
  m.textColor = COLORS.dim;
  return w;
}

let widget;
try {
  widget = buildWidget(await fetchMoneyData());
} catch (e) {
  widget = errorWidget(String(e));
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

// Last, and never allowed to fail loudly: the widget is already on screen, and
// a missed update just means trying again tomorrow.
try {
  await refreshWidgetScripts();
} catch {}

Script.complete();
