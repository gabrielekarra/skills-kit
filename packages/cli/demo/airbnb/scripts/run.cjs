const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PAGE = { width: 595.2756, height: 841.8898 };

const COLORS = {
  primary: '#FF5A5F',
  teal: '#00A699',
  text: '#484848',
  muted: '#767676',
  lightGray: '#F7F7F7',
  paleYellow: '#FFF8E7',
  orange: '#FFB400',
  white: '#FFFFFF'
};

const ICON = 'n';
const STAR_FULL = 'H';
const STAR_HALF = 'n';
const EURO = '\u20AC';
const MIDDLE_DOT = '\u00B7';
const BULLET = '\u2022';
const ARROW_UP = String.fromCharCode(173);
const ARROW_DOWN = String.fromCharCode(175);

const COMPARISON_MAX = {
  revenue: 35.2856441803,
  occupancy: 50.1859578308,
  bookings: 38.2352819108
};

const METRIC_CARD = {
  width: 155.9055,
  height: 119.0551,
  radius: 8.5039,
  row1Y: 439.3701,
  row2Y: 297.6378,
  xPositions: [42.51969, 221.1024, 399.685]
};

const COMPARISON = {
  barX: 175.748,
  barWidth: 73.7008,
  barHeight: 22.6772,
  barRadius: 5.6693,
  percentX: 269.2913,
  rows: [
    { label: 'Ricavi', labelY: 204.0945, barY: 198.4252, max: COMPARISON_MAX.revenue },
    { label: 'Occupazione', labelY: 161.5748, barY: 155.9055, max: COMPARISON_MAX.occupancy },
    { label: 'Prenotazioni', labelY: 119.0551, barY: 113.3858, max: COMPARISON_MAX.bookings }
  ]
};

const HIGHLIGHT_ROWS = [
  { bulletY: 538.5827, boxY: 535.748, textY: 544.252 },
  { bulletY: 510.2362, boxY: 507.4016, textY: 515.9055 },
  { bulletY: 481.8898, boxY: 479.0551, textY: 487.5591 }
];

const IMPROVEMENT_ROWS = [408.189, 379.8425];

const RECOMMENDATION_ROWS = [
  { centerY: 255.1181, numberY: 249.4488, textY: 246.6142 },
  { centerY: 221.1024, numberY: 215.4331, textY: 212.5984 },
  { centerY: 187.0866, numberY: 181.4173, textY: 178.5827 },
  { centerY: 153.0709, numberY: 147.4016, textY: 144.5669 }
];

const MONTHS_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre'
];

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isFinite(num) ? num : null;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysBetweenInclusive = (start, end) => {
  const dayMs = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((endUtc - startUtc) / dayMs) + 1);
};

const formatThousands = (value) => {
  if (!isNumber(value)) return '0';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
};

const formatCurrency = (value) => (isNumber(value) ? `${EURO}${formatThousands(value)}` : '-');

const formatDecimal = (value, decimals = 1) =>
  isNumber(value) ? value.toFixed(decimals) : '-';

const formatInteger = (value) => (isNumber(value) ? `${Math.round(value)}` : '-');

const formatPercent = (value, decimals = 1, signed = false) => {
  if (!isNumber(value)) return '-';
  const sign = signed ? (value >= 0 ? '+' : '-') : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
};

const formatPeriodLabel = (period, startDate, endDate) => {
  if (period.label) return period.label;
  if (!startDate || !endDate) return '';
  const startMonth = MONTHS_IT[startDate.getMonth()];
  const endMonth = MONTHS_IT[endDate.getMonth()];
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startMonth}-${endMonth} ${endDate.getFullYear()}`;
  }
  return `${startMonth} ${startDate.getFullYear()}-${endMonth} ${endDate.getFullYear()}`;
};

const formatReportMonth = (period, endDate) => {
  const date = endDate || parseDate(period.endDate) || new Date();
  return `${MONTHS_IT[date.getMonth()]} ${date.getFullYear()}`;
};

const formatPropertyDetails = (property) => {
  const parts = [];
  if (property.location) parts.push(property.location);
  if (property.type) parts.push(property.type);
  if (isNumber(property.bedrooms)) {
    parts.push(`${property.bedrooms} ${property.bedrooms === 1 ? 'camera' : 'camere'}`);
  }
  if (isNumber(property.maxGuests)) {
    parts.push(`${property.maxGuests} ${property.maxGuests === 1 ? 'ospite' : 'ospiti'}`);
  }
  return parts.join(` ${MIDDLE_DOT} `);
};

const normalizeList = (list, count) => {
  const items = Array.isArray(list) ? list.slice(0, count) : [];
  while (items.length < count) items.push('');
  return items;
};

const normalizeData = (input) => {
  const property = input?.property ?? {};
  const period = input?.period ?? {};
  const metrics = input?.metrics ?? {};
  const comparison = input?.comparison ?? {};
  const reviews = input?.reviews ?? {};

  const startDate = parseDate(period.startDate);
  const endDate = parseDate(period.endDate);
  const availableNights = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : null;

  let totalRevenue = toNumber(metrics.totalRevenue);
  let occupancyRate = toNumber(metrics.occupancyRate);
  let averageRating = toNumber(metrics.averageRating);
  let totalReviews = toNumber(metrics.totalReviews);
  let totalBookings = toNumber(metrics.totalBookings);
  let averageNightlyRate = toNumber(metrics.averageNightlyRate);
  let totalNights = toNumber(metrics.totalNights);

  if (totalNights === null && occupancyRate !== null && availableNights !== null) {
    totalNights = Math.round((occupancyRate / 100) * availableNights);
  }
  if (occupancyRate === null && totalNights !== null && availableNights !== null) {
    occupancyRate = (totalNights / availableNights) * 100;
  }
  if (totalRevenue === null && averageNightlyRate !== null && totalNights !== null) {
    totalRevenue = averageNightlyRate * totalNights;
  }
  if (averageNightlyRate === null && totalRevenue !== null && totalNights !== null) {
    averageNightlyRate = totalRevenue / totalNights;
  }

  const normalizedMetrics = {
    totalRevenue,
    occupancyRate,
    averageRating,
    totalReviews,
    totalBookings,
    averageNightlyRate,
    totalNights
  };

  const normalizedComparison = {
    revenueChange: toNumber(comparison.revenueChange) ?? 0,
    occupancyChange: toNumber(comparison.occupancyChange) ?? 0,
    bookingsChange: toNumber(comparison.bookingsChange) ?? 0
  };

  const highlights = normalizeList(reviews.highlights, 3);
  const areasToImprove = normalizeList(reviews.areasToImprove, 2);
  const recommendations = normalizeList(input?.recommendations, 4);

  return {
    property: {
      name: property.name || '',
      details: formatPropertyDetails(property)
    },
    periodLabel: formatPeriodLabel(period, startDate, endDate),
    reportMonth: formatReportMonth(period, endDate),
    metrics: normalizedMetrics,
    comparison: normalizedComparison,
    reviews: { highlights, areasToImprove },
    recommendations
  };
};

const pdfY = (y) => PAGE.height - y;

const drawText = (doc, text, x, y, options = {}) => {
  const { font = 'Helvetica', size = 12, color = COLORS.text, width, align } = options;
  doc.font(font).fontSize(size).fillColor(color);
  const textOptions = { lineBreak: false, baseline: 'alphabetic' };
  if (width) textOptions.width = width;
  if (align) textOptions.align = align;
  doc.text(text, x, pdfY(y), textOptions);
};

const fitText = (doc, text, maxWidth, options = {}) => {
  if (!text) return '';
  if (options.font || options.size) {
    doc.font(options.font || 'Helvetica').fontSize(options.size || 12);
  }
  if (doc.widthOfString(text) <= maxWidth) return text;
  const ellipsis = '...';
  let trimmed = text;
  while (trimmed.length && doc.widthOfString(trimmed + ellipsis) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed ? trimmed + ellipsis : text.slice(0, 1) + ellipsis;
};

const drawRoundedRect = (doc, x, y, width, height, radius, color) => {
  doc.fillColor(color);
  doc.roundedRect(x, pdfY(y + height), width, height, radius).fill();
};

const drawRect = (doc, x, y, width, height, color) => {
  doc.fillColor(color);
  doc.rect(x, pdfY(y + height), width, height).fill();
};

const drawIconLabel = (doc, x, y, iconSize, text, textSize, color, font = 'Helvetica-Bold') => {
  drawText(doc, ICON, x, y, { font: 'ZapfDingbats', size: iconSize, color });
  const iconWidth = doc.widthOfString(ICON);
  drawText(doc, ` ${text}`, x + iconWidth, y, { font, size: textSize, color });
};

const drawDelta = (doc, x, y, value) => {
  if (!isNumber(value)) return;
  const positive = value >= 0;
  const arrow = positive ? ARROW_UP : ARROW_DOWN;
  const color = positive ? COLORS.teal : COLORS.primary;
  drawText(doc, arrow, x, y, { font: 'Symbol', size: 9, color });
  const arrowWidth = doc.widthOfString(arrow);
  drawText(doc, ` ${formatPercent(value, 1, true)} vs prec.`, x + arrowWidth, y, {
    font: 'Helvetica',
    size: 9,
    color
  });
};

const drawMetricCards = (doc, data) => {
  METRIC_CARD.xPositions.forEach((x) => {
    drawRoundedRect(doc, x, METRIC_CARD.row1Y, METRIC_CARD.width, METRIC_CARD.height, METRIC_CARD.radius, COLORS.white);
    drawRoundedRect(doc, x, METRIC_CARD.row2Y, METRIC_CARD.width, METRIC_CARD.height, METRIC_CARD.radius, COLORS.white);
  });

  drawText(doc, formatCurrency(data.metrics.totalRevenue), 80.71844, 507.4016, {
    font: 'Helvetica-Bold',
    size: 22,
    color: COLORS.primary
  });
  drawText(doc, 'Ricavi Totali', 93.24744, 479.0551, { font: 'Helvetica', size: 10, color: COLORS.muted });
  drawDelta(doc, 84.11694, 462.0472, data.comparison.revenueChange);

  drawText(doc, formatPercent(data.metrics.occupancyRate, 1), 267.8701, 507.4016, {
    font: 'Helvetica-Bold',
    size: 22,
    color: COLORS.primary
  });
  drawText(doc, 'Occupazione', 269.8751, 479.0551, { font: 'Helvetica', size: 10, color: COLORS.muted });
  drawDelta(doc, 265.2016, 462.0472, data.comparison.occupancyChange);

  drawText(doc, formatDecimal(data.metrics.averageRating, 1), 462.3478, 507.4016, {
    font: 'Helvetica-Bold',
    size: 22,
    color: COLORS.primary
  });
  drawText(doc, `Rating (${formatInteger(data.metrics.totalReviews)} rev.)`, 443.1828, 479.0551, {
    font: 'Helvetica',
    size: 10,
    color: COLORS.muted
  });

  drawText(doc, formatInteger(data.metrics.totalBookings), 108.2404, 365.6693, {
    font: 'Helvetica-Bold',
    size: 22,
    color: COLORS.primary
  });
  drawText(doc, 'Prenotazioni', 92.68244, 337.3228, { font: 'Helvetica', size: 10, color: COLORS.muted });
  drawDelta(doc, 84.11694, 320.315, data.comparison.bookingsChange);

  drawText(doc, formatCurrency(data.metrics.averageNightlyRate), 274.5911, 365.6693, {
    font: 'Helvetica-Bold',
    size: 22,
    color: COLORS.primary
  });
  drawText(doc, 'Tariffa Media/Notte', 256.5401, 337.3228, {
    font: 'Helvetica',
    size: 10,
    color: COLORS.muted
  });

  drawText(doc, formatInteger(data.metrics.totalNights), 465.4058, 365.6693, {
    font: 'Helvetica-Bold',
    size: 22,
    color: COLORS.primary
  });
  drawText(doc, 'Notti Prenotate', 444.2878, 337.3228, { font: 'Helvetica', size: 10, color: COLORS.muted });
};

const drawComparisonRow = (doc, label, change, row) => {
  drawText(doc, label, 42.51969, row.labelY, { font: 'Helvetica', size: 10, color: COLORS.text });
  drawRoundedRect(doc, COMPARISON.barX, row.barY, COMPARISON.barWidth, COMPARISON.barHeight, COMPARISON.barRadius, COLORS.lightGray);

  if (isNumber(change)) {
    const ratio = Math.min(Math.abs(change) / row.max, 1);
    const barWidth = COMPARISON.barWidth * ratio;
    const radius = Math.min(COMPARISON.barRadius, barWidth / 2, COMPARISON.barHeight / 2);
    drawRoundedRect(doc, COMPARISON.barX, row.barY, barWidth, COMPARISON.barHeight, radius, COLORS.teal);
  }

  drawText(doc, formatPercent(change, 1, true), COMPARISON.percentX, row.labelY, {
    font: 'Helvetica-Bold',
    size: 10,
    color: COLORS.teal
  });
};

const drawPage1 = (doc, data) => {
  drawRect(doc, 0, 742.6772, PAGE.width, 99.2126, COLORS.primary);
  drawText(doc, 'REPORT PERFORMANCE', 42.51969, 785.1969, {
    font: 'Helvetica-Bold',
    size: 24,
    color: COLORS.white
  });
  drawText(doc, data.periodLabel, 499.0519, 785.1969, { font: 'Helvetica', size: 14, color: COLORS.white });

  drawIconLabel(doc, 42.51969, 685.9843, 20, data.property.name, 20, COLORS.text);

  drawText(doc, data.property.details, 62.3622, 663.3071, {
    font: 'Helvetica',
    size: 11,
    color: COLORS.muted,
    width: 480
  });

  drawIconLabel(doc, 42.51969, 600.9449, 14, 'METRICHE PRINCIPALI', 14, COLORS.text);
  drawMetricCards(doc, data);

  drawIconLabel(doc, 42.51969, 240.9449, 14, 'CONFRONTO PERIODO PRECEDENTE', 14, COLORS.text);
  drawComparisonRow(doc, 'Ricavi', data.comparison.revenueChange, COMPARISON.rows[0]);
  drawComparisonRow(doc, 'Occupazione', data.comparison.occupancyChange, COMPARISON.rows[1]);
  drawComparisonRow(doc, 'Prenotazioni', data.comparison.bookingsChange, COMPARISON.rows[2]);

  drawText(doc, 'Pagina 1 di 2', 274.2898, 28.34646, { font: 'Helvetica', size: 8, color: COLORS.muted });
};

const ratingStars = (rating) => {
  if (!isNumber(rating)) return '';
  const fullCount = Math.max(0, Math.min(5, Math.floor(rating)));
  const hasHalf = rating - fullCount >= 0.5 && fullCount < 5;
  return `${STAR_FULL.repeat(fullCount)}${hasHalf ? STAR_HALF : ''}`;
};

const drawHighlights = (doc, highlights) => {
  HIGHLIGHT_ROWS.forEach((row, index) => {
    drawRect(doc, 42.51969, row.bulletY, 8.503937, 22.67717, COLORS.teal);
    drawRoundedRect(doc, 53.85827, row.boxY, 453.54333, 28.3465, 5.6693, COLORS.lightGray);

    const text = highlights[index] ? `"${highlights[index]}"` : '';
    const fitted = fitText(doc, text, 440, { font: 'Helvetica', size: 10 });
    drawText(doc, fitted, 65.19685, row.textY, { font: 'Helvetica', size: 10, color: COLORS.text });
  });
};

const drawRecommendations = (doc, recommendations) => {
  recommendations.forEach((recommendation, index) => {
    const row = RECOMMENDATION_ROWS[index];
    if (!row) return;
    const centerX = 85.03937;
    const radius = 11.33858;
    doc.fillColor(COLORS.orange);
    doc.circle(centerX, pdfY(row.centerY), radius).fill();
    drawText(doc, `${index + 1}`, 82.53737, row.numberY, { font: 'Helvetica-Bold', size: 9, color: COLORS.white });

    const text = fitText(doc, recommendation || '', 400, { font: 'Helvetica', size: 10 });
    drawText(doc, text, 113.3858, row.textY, { font: 'Helvetica', size: 10, color: COLORS.text });
  });
};

const drawPage2 = (doc, data) => {
  drawRect(doc, 0, 771.0236, PAGE.width, 70.86614, COLORS.primary);
  const headerText = data.periodLabel ? `${data.property.name} - ${data.periodLabel}` : data.property.name;
  drawIconLabel(doc, 42.51969, 793.7008, 18, headerText, 18, COLORS.white);

  drawIconLabel(doc, 42.51969, 714.3307, 14, 'RECENSIONI OSPITI', 14, COLORS.text);

  drawRoundedRect(doc, 42.51969, 615.1181, 481.88971, 70.8662, 11.33858, COLORS.primary);
  drawText(doc, formatDecimal(data.metrics.averageRating, 1), 70.86614, 629.2913, {
    font: 'Helvetica-Bold',
    size: 36,
    color: COLORS.white
  });
  drawText(doc, ratingStars(data.metrics.averageRating), 141.7323, 634.9606, {
    font: 'ZapfDingbats',
    size: 18,
    color: COLORS.white
  });
  drawText(doc, `su ${formatInteger(data.metrics.totalReviews)} recensioni`, 325.9843, 634.9606, {
    font: 'Helvetica',
    size: 12,
    color: COLORS.white
  });

  drawIconLabel(doc, 42.51969, 572.5984, 12, 'Punti di forza:', 12, COLORS.text);
  drawHighlights(doc, data.reviews.highlights);

  drawIconLabel(doc, 42.51969, 436.5354, 12, 'Aree di miglioramento:', 12, COLORS.text);
  IMPROVEMENT_ROWS.forEach((y, index) => {
    const text = data.reviews.areasToImprove[index] || '';
    drawText(doc, `${BULLET} ${text}`.trim(), 56.69291, y, { font: 'Helvetica', size: 10, color: COLORS.text });
  });

  drawRoundedRect(doc, 42.51969, 130.3937, 481.88971, 178.5827, 11.33858, COLORS.paleYellow);
  drawRect(doc, 42.51969, 130.3937, 11.33858, 178.5827, COLORS.orange);
  drawIconLabel(doc, 70.86614, 280.6299, 14, 'RACCOMANDAZIONI', 14, COLORS.text);
  drawRecommendations(doc, data.recommendations);

  doc.strokeColor(COLORS.muted);
  doc.moveTo(42.51969, pdfY(56.69291)).lineTo(552.7559, pdfY(56.69291)).stroke();

  drawText(doc, `Report generato da skills-kit ${MIDDLE_DOT} ${data.reportMonth}`, 207.6063, 28.34646, {
    font: 'Helvetica',
    size: 9,
    color: COLORS.muted
  });
  drawText(doc, 'Pagina 2 di 2', 271.3713, 22.67717, { font: 'Helvetica', size: 9, color: COLORS.muted });
};

let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = normalizeData(JSON.parse(input || '{}'));
    const outputDir = path.resolve('output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const pdfPath = path.join(outputDir, 'airbnb_property_report.pdf');

    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    drawPage1(doc, data);
    doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    drawPage2(doc, data);

    doc.end();
    writeStream.on('finish', () => {
      console.log(JSON.stringify({ ok: true, pdfPath }));
    });
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: { message: err.message } }));
  }
});
