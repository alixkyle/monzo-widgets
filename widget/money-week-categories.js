// Monzo Categories — weekly spending by Monzo category (Scriptable)
//
// The same seven days and the same total as "Monzo Spending", but each bar is
// split the way Monzo splits it — eating out, groceries, transport — instead
// of by how the money left the account. See SETUP.md for the walkthrough.

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

// One colour per Monzo category, kept close to the shades the Monzo app uses
// so the chart reads the same way as the Spending tab in the app.
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

// Monzo lets you invent your own categories, so anything unrecognised takes
// the next of these rather than every custom category looking identical.
const SPARE_COLORS = ["#E8A33D", "#7FD1C4", "#C48AF5", "#F2707D", "#9EB84F"];
const OTHER_COLOR = "#4A6786";

// Five named categories plus "Other" is what fits the legend without the
// labels shrinking to the point of being unreadable.
const TOP_CATEGORIES = 5;

// Set a widget's Parameter to 1 for the week before last, 2 for the one
// before that, and so on, exactly as Monzo Spending does.
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
 * The week's biggest categories, largest first, with the long tail folded
 * into a single "Other" band so a week with fifteen categories still produces
 * a chart you can read at a glance.
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

function drawChart(days, series, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Tighter bands than the single-legend charts: the second legend row has to
  // come from somewhere, and the bars are the only place with slack.
  const labelBand = 14;
  const valueBand = 12;
  const plotHeight = height - labelBand - valueBand;

  const totals = days.map((day) =>
    segmentValues(day.categories, series).reduce((sum, v) => sum + v, 0)
  );
  // Scale to the biggest day, with a floor so an empty week isn't dividing
  // by zero and every bar doesn't render full-height.
  const peak = Math.max(...totals, 1);

  const slot = width / days.length;
  const barWidth = Math.min(slot * 0.62, 26);

  days.forEach((day, i) => {
    const centre = slot * i + slot / 2;
    const x = centre - barWidth / 2;
    const values = segmentValues(day.categories, series);
    const total = totals[i];
    const totalPx = (total / peak) * plotHeight;
    const baseline = valueBand + plotHeight;

    if (total === 0) {
      // Show an empty day as a faint stub rather than nothing at all.
      ctx.setFillColor(COLORS.grid);
      ctx.fillRect(new Rect(x, baseline - 2, barWidth, 2));
    } else {
      // Stack upwards from the baseline, biggest category of the week first.
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

  const title = header.addText(periodLabel(data));
  title.font = Font.semiboldSystemFont(10);
  title.textColor = COLORS.dim;

  header.addSpacer();

  const total = header.addText(money(data.weekTotal));
  total.font = Font.heavySystemFont(16);
  total.textColor = COLORS.text;

  w.addSpacer(6);

  // Ranked once for the whole week so a category keeps the same colour and
  // the same position in every bar.
  const series = rankCategories(data.categoryTotals);

  // A medium widget only has room for about 125pt of content, and the wrapped
  // legend claims two rows of it, so the chart is shorter than the
  // single-legend ones. Overflowing here silently clips the legend.
  const large = config.widgetFamily === "large";
  const width = 300;
  const height = large ? 200 : 62;
  w.addImage(drawChart(data.days, series, width, height)).imageSize = new Size(
    width,
    height
  );

  w.addSpacer(5);
  if (series.length === 0) {
    const empty = w.addText("Nothing spent this week");
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
  const t = w.addText("Monzo Categories");
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
