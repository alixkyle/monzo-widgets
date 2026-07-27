// Monzo Today — iOS home screen widget (Scriptable)
//
// Setup: copy this file into Scriptable on your iPhone, fill in the two values
// below, then add a Scriptable widget to your home screen and pick this script.
// See SETUP.md for the full walkthrough.

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

async function loadWidgetSettings() {
  const defaults = {
    workerUrl: "",
    widgetKey: "",
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
  ].join("&");

  // Use Monzo Spending as the single source of truth for today's spending total.
  const week = await loadJSON(`${workerUrl}/week?${weekQuery}`, widgetKey);
  const summary = await loadJSON(
    `${workerUrl}/summary?dayStart=${encodeURIComponent(SETTINGS.dayStart)}`,
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

  const total = w.addText(money(data.spentToday, data.currency));
  total.font = Font.heavySystemFont(36);
  total.textColor = COLORS.text;

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
  const rows = config.widgetFamily === "small" ? 0 : 3;
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

Script.complete();
