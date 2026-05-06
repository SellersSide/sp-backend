const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

/**
 * Parse uploaded file buffer into an array of row objects.
 * Supports CSV and XLSX.
 */
function parseFile(buffer, mimetype, originalname) {
  const ext = originalname?.split('.').pop()?.toLowerCase();

  if (mimetype === 'text/csv' || ext === 'csv') {
    return parseCSV(buffer);
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel' ||
    ext === 'xlsx' ||
    ext === 'xls'
  ) {
    return parseXLSX(buffer);
  }

  throw new Error(`Unsupported file type: ${mimetype || ext}`);
}

function parseCSV(buffer) {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  return records;
}

function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/**
 * Normalise a parsed row array to a consistent keyword report shape.
 * Tries to detect common column name patterns from:
 *   - Amazon Search Query Performance (SQP)
 *   - Helium 10 Cerebro / Magnet
 *   - Data Dive
 *   - Generic keyword + volume format
 */
function normaliseKeywordReport(rows) {
  if (!rows.length) throw new Error('File is empty');

  const headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase());

  // Column detection helpers
  const find = (...candidates) =>
    candidates.find(c => headers.includes(c.toLowerCase())) || null;

  const keywordCol =
    find('keyword', 'search term', 'search query', 'keyword phrase', 'query') ||
    headers[0];

  const volumeCol =
    find(
      'search volume', 'search frequency rank', 'sfr',
      'estimated monthly search volume', 'monthly search volume',
      'avg monthly searches', 'volume'
    );

  const clicksCol = find('clicks', 'click share', 'total clicks');
  const salesCol  = find('conversions', 'orders', 'total orders', 'purchases');
  const aovCol    = find('aov', 'average order value', 'revenue per click');
  const impressionsCol = find('impressions', 'total impressions');

  const normalised = rows.map(row => {
    const get = col => (col ? String(row[col] ?? row[Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase())] ?? '').trim() : '');

    return {
      keyword:     get(keywordCol),
      volume:      toNumber(get(volumeCol)),
      clicks:      toNumber(get(clicksCol)),
      orders:      toNumber(get(salesCol)),
      impressions: toNumber(get(impressionsCol)),
      aov:         toNumber(get(aovCol)),
      // Pass through all original columns too
      _raw: row,
    };
  }).filter(r => r.keyword);

  return {
    rows: normalised,
    detectedColumns: { keywordCol, volumeCol, clicksCol, salesCol, aovCol, impressionsCol },
    totalRows: normalised.length,
  };
}

function toNumber(val) {
  if (val === '' || val === null || val === undefined) return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

module.exports = { parseFile, normaliseKeywordReport };
