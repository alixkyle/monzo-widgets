// Monzo Balances & Pots — total balance and Monzo pots (Scriptable)
// Designed for a small iOS home-screen widget.

const WORKER_URL = "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev";
const WIDGET_KEY = "PASTE_YOUR_WIDGET_KEY";

const COLORS = {
  bg: new Color("#001E3A"),
  coral: new Color("#FF4F40"),
  text: new Color("#F7F5F2"),
  dim: new Color("#8FA3B8"),
  green: new Color("#4BB78F"),
};

async function loadWidgetSettings() {
  const defaults = {
    workerUrl: "",
    widgetKey: "",
    accountId: "",
    subtractFlexFromTotal: true,
    hideZeroPots: true,
    showCurrentAccount: true,
    showFlex: true,
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

async function fetchPots() {
  const workerUrl = SETTINGS.workerUrl || WORKER_URL;
  const widgetKey = SETTINGS.widgetKey || WIDGET_KEY;
  const req = new Request(
    `${workerUrl}/pots?account=${encodeURIComponent(SETTINGS.accountId)}`
  );
  req.headers = { Authorization: `Bearer ${widgetKey}` };
  req.timeoutInterval = 15;
  return req.loadJSON();
}

function money(minorUnits, currency = "GBP") {
  const symbol = currency === "GBP" ? "£" : "";
  const value = Math.abs(minorUnits) / 100;
  return `${symbol}${value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function balanceRow(w, nameText, balance, currency, color) {
  const row = w.addStack();
  row.layoutHorizontally();

  const name = row.addText(nameText);
  name.font = Font.systemFont(9);
  name.textColor = COLORS.dim;
  name.lineLimit = 1;

  row.addSpacer();

  const prefix = balance < 0 ? "-" : "";
  const amount = row.addText(`${prefix}${money(balance, currency)}`);
  amount.font = Font.semiboldSystemFont(9);
  amount.textColor = color;
  amount.lineLimit = 1;

  w.addSpacer(2);
}

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
  w.setPadding(12, 14, 11, 14);

  w.addImage(accentBar(28)).imageSize = new Size(28, 3);
  w.addSpacer(6);

  const label = w.addText("TOTAL BALANCE");
  label.font = Font.semiboldSystemFont(9);
  label.textColor = COLORS.dim;

  w.addSpacer(2);

  const headlineBalance =
    data.totalBalance +
    (SETTINGS.subtractFlexFromTotal ? data.flexBalance ?? 0 : 0);
  const total = w.addText(money(headlineBalance, data.currency));
  total.font = Font.heavySystemFont(25);
  total.textColor = COLORS.text;
  total.minimumScaleFactor = 0.7;
  total.lineLimit = 1;

  w.addSpacer(5);

  if (SETTINGS.showCurrentAccount) {
    balanceRow(
      w,
      "Current account",
      data.currentBalance,
      data.currency,
      COLORS.green
    );
  }

  if (SETTINGS.showFlex && data.flexBalance !== null) {
    balanceRow(w, "Flex", data.flexBalance, data.currency, COLORS.coral);
  }

  const pots = SETTINGS.hideZeroPots
    ? data.pots.filter((pot) => pot.balance > 0)
    : data.pots;
  for (const pot of pots.slice(0, 5)) {
    balanceRow(w, pot.name, pot.balance, data.currency, COLORS.dim);
  }

  w.addSpacer();
  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  const title = w.addText("Monzo Balances & Pots");
  title.font = Font.heavySystemFont(14);
  title.textColor = COLORS.coral;
  w.addSpacer(4);
  const text = w.addText(message);
  text.font = Font.systemFont(10);
  text.textColor = COLORS.dim;
  return w;
}

let widget;
try {
  widget = buildWidget(await fetchPots());
} catch (error) {
  widget = errorWidget(String(error));
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}

Script.complete();
