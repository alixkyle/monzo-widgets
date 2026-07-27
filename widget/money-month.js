// Monzo 4 Weeks — the last four weeks side by side (Scriptable)
//
// One medium widget instead of a stack: four bars, one per rolling week, each
// split by Monzo category. The right-hand bar covers the same seven days as
// Monzo Spending and Monzo Categories, so it normally prints the same figure —
// see the README for the refund case where they can differ.

const WORKER_URL = "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev";
const WIDGET_KEY = "PASTE_YOUR_WIDGET_KEY";

// ---------------------------------------------------------------------------

const COLORS = {
  bg: new Color("#001E3A"),
  text: new Color("#F7F5F2"),
  dim: new Color("#8FA3B8"),
  accent: new Color("#FF4F40"),
  grid: new Color("#245F8C"),
};

// Matches the palette in money-week-categories.js, so a category is the same
// colour whichever of the two charts you are looking at.
const CATEGORY_COLORS = {
  eating_out: "#FF4F40",
  groceries: "#4BB78F",
  shopping: "#F1BD76",
  transport: "#59A5E0",
  entertainment: "#B57BE0",
  bills: "#2FB6A8",
  holidays: "#63C7E0",
  personal_care: "#F58AA8",
  family: "#F58A3E",
  savings: "#69D2AE",
  transfers: "#7A93AB",
  cash: "#C9B48A",
  expenses: "#6C7BD9",
  charity: "#E0607E",
  gifts: "#D46FD0",
  finances: "#4E86B4",
  income: "#8CD867",
  general: "#8FA3B8",
};

const SPARE_COLORS = ["#E8A33D", "#7FD1C4", "#C48AF5", "#F2707D", "#9EB84F"];
const OTHER_COLOR = "#4A6786";
const TOP_CATEGORIES = 5;

const WEEKS = 4;

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

async function fetchWeeks() {
  const workerUrl = SETTINGS.workerUrl || WORKER_URL;
  const widgetKey = SETTINGS.widgetKey || WIDGET_KEY;
  const excluded = [];
  if (SETTINGS.excludeBills) excluded.push("bills");
  if (SETTINGS.excludeSavings) excluded.push("savings");
  const query = [
    `count=${WEEKS}`,
    `exclude=${encodeURIComponent(excluded.join(","))}`,
    `includeFlex=${SETTINGS.includeFlexWeek}`,
    `dayStart=${encodeURIComponent(SETTINGS.dayStart)}`,
    `splitRepayments=${encodeURIComponent(SETTINGS.splitRepayments)}`,
    `unlinkedIncoming=${encodeURIComponent(SETTINGS.unlinkedIncoming)}`,
    `cardRefunds=${encodeURIComponent(SETTINGS.cardRefunds)}`,
    `outgoingTransfers=${encodeURIComponent(SETTINGS.outgoingTransfers)}`,
    `account=${encodeURIComponent(SETTINGS.accountId)}`,
  ].join("&");
  const req = new Request(`${workerUrl}/weeks?${query}`);
  req.headers = { Authorization: `Bearer ${widgetKey}` };
  // Four weeks is four times the transactions, so allow a little longer.
  req.timeoutInterval = 25;
  return req.loadJSON();
}

function money(minorUnits) {
  return `£${(Math.abs(minorUnits) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole pounds only — bar labels have no room for pence. */
function shortMoney(minorUnits) {
  return `£${Math.round(Math.abs(minorUnits) / 100)}`;
}

/** "eating_out" is Monzo's key; "Eating out" is what belongs on a legend. */
function categoryName(category) {
  const words = category.replace(/_/g, " ").trim();
  const titled = words.charAt(0).toUpperCase() + words.slice(1);
  return titled.length > 13 ? `${titled.slice(0, 12)}…` : titled;
}

/**
 * The four weeks' biggest categories, largest first, with the long tail
 * folded into a single "Other" band. Ranked across the whole period so a
 * category holds its colour and its place in the stack in every bar.
 */
function rankCategories(categoryTotals) {
  const ranked = Object.entries(categoryTotals ?? {})
    .map(([key, amount]) => ({ key, amount: Math.abs(amount) }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  let spare = 0;
  const series = ranked.slice(0, TOP_CATEGORIES).map((entry) => ({
    key: entry.key,
    label: categoryName(entry.key),
    color: new Color(
      CATEGORY_COLORS[entry.key] ?? SPARE_COLORS[spare++ % SPARE_COLORS.length]
    ),
  }));

  if (ranked.length > TOP_CATEGORIES) {
    series.push({
      key: null,
      label: "Other",
      color: new Color(OTHER_COLOR),
      isOther: true,
    });
  }

  return series;
}

/** One value per legend entry, with "Other" absorbing everything unnamed. */
function segmentValues(categories, series) {
  const named = new Set(series.map((entry) => entry.key).filter(Boolean));

  return series.map((entry) => {
    if (!entry.isOther) return Math.abs((categories ?? {})[entry.key] ?? 0);
    return Object.entries(categories ?? {})
      .filter(([key]) => !named.has(key))
      .reduce((sum, [, amount]) => sum + Math.abs(amount), 0);
  });
}

/** The newest bar is a running week, not a finished one — say so. */
function weekLabel(week) {
  return week.latest ? "Now" : week.label;
}

function drawChart(weeks, series, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Tighter bands than the single-legend charts: the second legend row has to
  // come from somewhere, and the bars are the only place with slack.
  const labelBand = 14;
  const valueBand = 12;
  const plotHeight = height - labelBand - valueBand;

  const totals = weeks.map((week) =>
    segmentValues(week.categories, series).reduce((sum, v) => sum + v, 0)
  );
  const peak = Math.max(...totals, 1);

  const slot = width / weeks.length;
  // Only four bars, so they can be much wider than the daily charts'.
  const barWidth = Math.min(slot * 0.5, 40);

  weeks.forEach((week, i) => {
    const centre = slot * i + slot / 2;
    const x = centre - barWidth / 2;
    const values = segmentValues(week.categories, series);
    const total = totals[i];
    const totalPx = (total / peak) * plotHeight;
    const baseline = valueBand + plotHeight;

    if (total === 0) {
      ctx.setFillColor(COLORS.grid);
      ctx.fillRect(new Rect(x, baseline - 2, barWidth, 2));
    } else {
      let offset = 0;
      values.forEach((value, index) => {
        if (value === 0) return;
        const segmentHeight = (value / total) * totalPx;
        ctx.setFillColor(series[index].color);
        ctx.fillRect(
          new Rect(x, baseline - offset - segmentHeight, barWidth, segmentHeight)
        );
        offset += segmentHeight;
      });

      ctx.setFont(Font.mediumSystemFont(10));
      ctx.setTextColor(COLORS.text);
      ctx.setTextAlignedCenter();
      ctx.drawTextInRect(
        shortMoney(total),
        new Rect(centre - slot / 2, baseline - totalPx - valueBand, slot, valueBand)
      );
    }

    ctx.setFont(
      week.latest ? Font.semiboldSystemFont(10) : Font.systemFont(10)
    );
    ctx.setTextColor(week.latest ? COLORS.text : COLORS.dim);
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(
      weekLabel(week),
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
  const text = stack.addText(label);
  text.font = Font.systemFont(9);
  text.textColor = COLORS.dim;
  text.lineLimit = 1;
}

/** Six categories will not fit on one line, so the legend wraps. */
function addLegend(widget, series, perRow) {
  for (let i = 0; i < series.length; i += perRow) {
    const row = widget.addStack();
    row.layoutHorizontally();
    series.slice(i, i + perRow).forEach((entry, index) => {
      if (index > 0) row.addSpacer(8);
      legendDot(row, entry.color, entry.label);
    });
    row.addSpacer();
    if (i + perRow < series.length) widget.addSpacer(2);
  }
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
  w.addSpacer(6);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const title = header.addText(`LAST ${data.weeks.length} WEEKS`);
  title.font = Font.semiboldSystemFont(10);
  title.textColor = COLORS.dim;

  header.addSpacer();

  const total = header.addText(money(data.periodTotal));
  total.font = Font.heavySystemFont(16);
  total.textColor = COLORS.text;

  w.addSpacer(6);

  const series = rankCategories(data.categoryTotals);

  // A medium widget only has room for about 125pt of content, and the wrapped
  // legend claims two rows of it, so the chart is shorter than the
  // single-legend ones. Overflowing here silently clips the legend.
  const large = config.widgetFamily === "large";
  const width = 300;
  const height = large ? 200 : 62;
  w.addImage(drawChart(data.weeks, series, width, height)).imageSize = new Size(
    width,
    height
  );

  w.addSpacer(5);
  if (series.length === 0) {
    const empty = w.addText("Nothing spent in the last four weeks");
    empty.font = Font.systemFont(9);
    empty.textColor = COLORS.dim;
  } else {
    addLegend(w, series, 3);
  }

  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  const t = w.addText("Monzo 4 Weeks");
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
  widget = buildWidget(await fetchWeeks());
} catch (e) {
  widget = errorWidget(String(e));
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();
