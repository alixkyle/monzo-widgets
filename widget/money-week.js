// Monzo Spending — weekly spending chart (Scriptable)
//
// A second widget alongside "Monzo Today". Shows the last 7 days as stacked
// bars: card spending, transfers to people, then Flex.
// See SETUP.md for the walkthrough.

const WORKER_URL = "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev";
const WIDGET_KEY = "PASTE_YOUR_WIDGET_KEY";

// ---------------------------------------------------------------------------

// Monzo's brand palette: hot coral on deep navy, with blue and green from
// their secondary set for the other methods. Coral is reserved for Flex, the
// one that costs you money, so card spending takes the blue. Their hero
// typeface (Oldschool Grotesk) isn't available to Scriptable, so heavy system
// weights stand in for it.
const COLORS = {
  bg: new Color("#001E3A"),
  text: new Color("#F7F5F2"),
  dim: new Color("#8FA3B8"),
  accent: new Color("#FF4F40"),
  card: new Color("#59A5E0"),
  transfers: new Color("#4BB78F"),
  flex: new Color("#FF4F40"),
  grid: new Color("#245F8C"),
};

// Set a widget's Parameter to 1 for the week before last, 2 for the one
// before that, and so on. Add the script several times with different
// parameters and stack them to swipe back through the weeks.
const weeksAgo = Number(args.widgetParameter) || 0;

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

async function fetchWeek() {
  const workerUrl = SETTINGS.workerUrl || WORKER_URL;
  const widgetKey = SETTINGS.widgetKey || WIDGET_KEY;
  const excluded = [];
  if (SETTINGS.excludeBills) excluded.push("bills");
  if (SETTINGS.excludeSavings) excluded.push("savings");
  const query = [
    `weeks=${weeksAgo}`,
    `exclude=${encodeURIComponent(excluded.join(","))}`,
    `includeFlex=${SETTINGS.includeFlexWeek}`,
    `dayStart=${encodeURIComponent(SETTINGS.dayStart)}`,
    `splitRepayments=${encodeURIComponent(SETTINGS.splitRepayments)}`,
    `unlinkedIncoming=${encodeURIComponent(SETTINGS.unlinkedIncoming)}`,
    `cardRefunds=${encodeURIComponent(SETTINGS.cardRefunds)}`,
    `outgoingTransfers=${encodeURIComponent(SETTINGS.outgoingTransfers)}`,
    `account=${encodeURIComponent(SETTINGS.accountId)}`,
  ].join("&");
  const req = new Request(`${workerUrl}/week?${query}`);
  req.headers = { Authorization: `Bearer ${widgetKey}` };
  req.timeoutInterval = 15;
  return req.loadJSON();
}

/** "LAST 7 DAYS" for the current week, otherwise the dates it covers. */
function periodLabel(data) {
  if (data.weeksAgo === 0) return "LAST 7 DAYS";

  const opts = { day: "numeric", month: "short", timeZone: "Europe/London" };
  const from = new Date(data.days[0].date).toLocaleDateString("en-GB", opts);
  const to = new Date(data.days[data.days.length - 1].date).toLocaleDateString(
    "en-GB",
    opts
  );
  return `${from} – ${to}`.toUpperCase();
}

function money(minorUnits) {
  return `£${(Math.abs(minorUnits) / 100).toFixed(2)}`;
}

/** Whole pounds only — bar labels have no room for pence. */
function shortMoney(minorUnits) {
  return `£${Math.round(Math.abs(minorUnits) / 100)}`;
}

function drawChart(days, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const labelBand = 16;
  const valueBand = 13;
  const plotHeight = height - labelBand - valueBand;

  // Scale to the biggest day, with a floor so an empty week isn't dividing
  // by zero and every bar doesn't render full-height.
  const peak = Math.max(...days.map((d) => Math.abs(d.total)), 1);

  const slot = width / days.length;
  const barWidth = Math.min(slot * 0.62, 26);

  days.forEach((day, i) => {
    const centre = slot * i + slot / 2;
    const x = centre - barWidth / 2;

    const segments = [
      { value: Math.abs(day.card), color: COLORS.card },
      { value: Math.abs(day.transfers), color: COLORS.transfers },
      { value: Math.abs(day.flex), color: COLORS.flex },
    ];
    const total = segments.reduce((sum, s) => sum + s.value, 0);

    const totalPx = (total / peak) * plotHeight;
    const baseline = valueBand + plotHeight;

    if (total === 0) {
      // Show an empty day as a faint stub rather than nothing at all.
      ctx.setFillColor(COLORS.grid);
      ctx.fillRect(new Rect(x, baseline - 2, barWidth, 2));
    } else {
      // Stack upwards from the baseline, largest category first.
      let offset = 0;
      for (const segment of segments) {
        if (segment.value === 0) continue;
        const height = (segment.value / total) * totalPx;
        ctx.setFillColor(segment.color);
        ctx.fillRect(new Rect(x, baseline - offset - height, barWidth, height));
        offset += height;
      }

      ctx.setFont(Font.mediumSystemFont(9));
      ctx.setTextColor(COLORS.dim);
      ctx.setTextAlignedCenter();
      ctx.drawTextInRect(
        shortMoney(total),
        new Rect(centre - slot / 2, baseline - totalPx - valueBand, slot, valueBand)
      );
    }

    ctx.setFont(Font.systemFont(10));
    ctx.setTextColor(COLORS.dim);
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(
      day.label,
      new Rect(centre - slot / 2, baseline + 3, slot, labelBand)
    );
  });

  return ctx.getImage();
}

function legendDot(stack, color, label) {
  const dot = stack.addText("●");
  dot.font = Font.systemFont(9);
  dot.textColor = color;
  stack.addSpacer(3);
  const t = stack.addText(label);
  t.font = Font.systemFont(9);
  t.textColor = COLORS.dim;
}

function buildWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(12, 14, 12, 14);

  const accent = new DrawContext();
  accent.size = new Size(28, 3);
  accent.opaque = false;
  accent.respectScreenScale = true;
  accent.setFillColor(COLORS.accent);
  accent.fillRect(new Rect(0, 0, 28, 3));
  w.addImage(accent.getImage()).imageSize = new Size(28, 3);
  w.addSpacer(7);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const title = header.addText(periodLabel(data));
  title.font = Font.semiboldSystemFont(10);
  title.textColor = COLORS.dim;

  header.addSpacer();

  const total = header.addText(money(data.weekTotal));
  total.font = Font.heavySystemFont(16);
  total.textColor = COLORS.text;

  w.addSpacer(7);

  const large = config.widgetFamily === "large";
  const width = 300;
  const height = large ? 150 : 72;
  w.addImage(drawChart(data.days, width, height)).imageSize = new Size(
    width,
    height
  );

  w.addSpacer(6);
  const legend = w.addStack();
  legend.layoutHorizontally();
  legendDot(legend, COLORS.card, "Card");
  legend.addSpacer(8);
  legendDot(legend, COLORS.transfers, "Transfers");
  if (data.hasFlex) {
    legend.addSpacer(8);
    legendDot(legend, COLORS.flex, "Flex");
  }
  legend.addSpacer();

  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  const t = w.addText("Monzo Spending");
  t.font = Font.heavySystemFont(14);
  t.textColor = COLORS.accent;
  w.addSpacer(4);
  const m = w.addText(message);
  m.font = Font.systemFont(10);
  m.textColor = COLORS.dim;
  return w;
}

let widget;
try {
  widget = buildWidget(await fetchWeek());
} catch (e) {
  widget = errorWidget(String(e));
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();
