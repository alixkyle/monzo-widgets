// Monzo Bills & Savings — weekly bills and savings chart (Scriptable)
//
// Copy this into a new Scriptable script, then add it beneath Monzo Spending.

const WORKER_URL = "https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev";
const WIDGET_KEY = "PASTE_YOUR_WIDGET_KEY";

const COLORS = {
  bg: new Color("#001E3A"),
  text: new Color("#F7F5F2"),
  dim: new Color("#8FA3B8"),
  card: new Color("#FF4F40"),
  transfers: new Color("#4BB78F"),
  flex: new Color("#F1BD76"),
  grid: new Color("#245F8C"),
};

const weeksAgo = Number(args.widgetParameter) || 0;

async function loadWidgetSettings() {
  const defaults = {
    workerUrl: "",
    widgetKey: "",
    accountId: "",
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
  const req = new Request(
    `${workerUrl}/week?weeks=${weeksAgo}` +
      `&categories=bills,savings` +
      `&includeFlex=${SETTINGS.includeFlexWeek}` +
      `&dayStart=${encodeURIComponent(SETTINGS.dayStart)}` +
      `&splitRepayments=${encodeURIComponent(SETTINGS.splitRepayments)}` +
      `&unlinkedIncoming=${encodeURIComponent(SETTINGS.unlinkedIncoming)}` +
      `&cardRefunds=${encodeURIComponent(SETTINGS.cardRefunds)}` +
      `&outgoingTransfers=${encodeURIComponent(SETTINGS.outgoingTransfers)}` +
      `&account=${encodeURIComponent(SETTINGS.accountId)}`
  );
  req.headers = { Authorization: `Bearer ${widgetKey}` };
  req.timeoutInterval = 15;
  return req.loadJSON();
}

function money(minorUnits) {
  return `£${(Math.abs(minorUnits) / 100).toFixed(2)}`;
}

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
  const peak = Math.max(...days.map((d) => Math.abs(d.total)), 1);
  const slot = width / days.length;
  const barWidth = Math.min(slot * 0.62, 26);

  days.forEach((day, i) => {
    const centre = slot * i + slot / 2;
    const x = centre - barWidth / 2;
    const segments = [
      { value: Math.abs(day.bills), color: COLORS.card },
      { value: Math.abs(day.savings), color: COLORS.transfers },
    ];
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const totalPx = (total / peak) * plotHeight;
    const baseline = valueBand + plotHeight;

    if (total === 0) {
      ctx.setFillColor(COLORS.grid);
      ctx.fillRect(new Rect(x, baseline - 2, barWidth, 2));
    } else {
      let offset = 0;
      for (const segment of segments) {
        if (segment.value === 0) continue;
        const segmentHeight = (segment.value / total) * totalPx;
        ctx.setFillColor(segment.color);
        ctx.fillRect(
          new Rect(x, baseline - offset - segmentHeight, barWidth, segmentHeight)
        );
        offset += segmentHeight;
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
  const text = stack.addText(label);
  text.font = Font.systemFont(9);
  text.textColor = COLORS.dim;
}

function buildWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(12, 14, 12, 14);

  const accent = new DrawContext();
  accent.size = new Size(28, 3);
  accent.opaque = false;
  accent.respectScreenScale = true;
  accent.setFillColor(COLORS.card);
  accent.fillRect(new Rect(0, 0, 28, 3));
  w.addImage(accent.getImage()).imageSize = new Size(28, 3);
  w.addSpacer(7);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const title = header.addText("BILLS + SAVINGS");
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
  w.addImage(drawChart(data.days, width, height)).imageSize = new Size(width, height);

  w.addSpacer(6);
  const legend = w.addStack();
  legend.layoutHorizontally();
  legendDot(legend, COLORS.card, "Bills");
  legend.addSpacer(8);
  legendDot(legend, COLORS.transfers, "Savings");
  legend.addSpacer();
  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  const title = w.addText("Monzo Bills & Savings");
  title.font = Font.heavySystemFont(14);
  title.textColor = COLORS.card;
  w.addSpacer(4);
  const text = w.addText(message);
  text.font = Font.systemFont(10);
  text.textColor = COLORS.dim;
  return w;
}

let widget;
try {
  widget = buildWidget(await fetchWeek());
} catch (error) {
  widget = errorWidget(String(error));
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();
