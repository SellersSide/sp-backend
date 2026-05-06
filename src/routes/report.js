const router = require('express').Router();
const { upload } = require('../middleware/upload');
const { parseFile, normaliseKeywordReport } = require('../services/fileParser');
const { callClaude } = require('../services/claude');

/**
 * POST /api/report/analyse
 * Multipart form: file (CSV/XLSX) + optional: context, asin, marketplace
 *
 * Full report analysis: identifies top performers, waste, and opportunities.
 */
router.post('/analyse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { context, asin, marketplace = 'UK' } = req.body;

    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const { rows, detectedColumns, totalRows } = normaliseKeywordReport(parsed);

    if (!totalRows) return res.status(400).json({ error: 'No data rows found in file' });

    const sample = rows.slice(0, 250);
    const truncated = totalRows > 250;

    const systemPrompt = `You are a senior Amazon PPC analyst at a UK-based Amazon agency.
Analyse a keyword/search query report and return structured insights.

Focus on:
1. Top converting search terms worth isolating in exact match campaigns
2. High-volume terms with zero or low conversions (potential negatives or bid-down candidates)
3. Keywords showing strong ROI signals worth scaling
4. Patterns in search intent across the data
5. Specific campaign structure recommendations

Return ONLY valid JSON:
{
  "overview": {
    "total_keywords": 0,
    "keywords_with_conversions": 0,
    "keywords_zero_conversions": 0,
    "top_volume_keyword": "string",
    "data_quality": "good | partial | limited"
  },
  "top_performers": [
    { "keyword": "string", "volume": null, "orders": null, "reason": "string" }
  ],
  "waste_candidates": [
    { "keyword": "string", "clicks": null, "orders": 0, "recommendation": "negative | bid_down | monitor" }
  ],
  "scale_opportunities": [
    { "keyword": "string", "signal": "string", "suggested_action": "string" }
  ],
  "intent_patterns": ["string"],
  "campaign_recommendations": [
    {
      "action": "create | expand | restructure",
      "campaign_type": "NB_EXACT | NB_PHRASE | BR_EXACT | NBSKC_EXACT | etc",
      "keywords": ["string"],
      "rationale": "string"
    }
  ],
  "negative_candidates": ["string"],
  "summary": "2-3 sentence executive summary"
}`;

    const kwData = sample.map(r =>
      `${r.keyword}${r.volume !== null ? ` | vol:${r.volume}` : ''}${r.clicks !== null ? ` | clicks:${r.clicks}` : ''}${r.orders !== null ? ` | orders:${r.orders}` : ''}`
    ).join('\n');

    const userMessage = `Marketplace: ${marketplace}
ASIN: ${asin || 'Not provided'}
Context: ${context || 'Not provided'}
${truncated ? `\n⚠ Showing first 250 of ${totalRows} rows.\n` : ''}
Report data:
${kwData}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({
      success: true,
      file: { name: req.file.originalname, rows: totalRows, truncated, detectedColumns },
      ...result,
    });

  } catch (err) {
    console.error('[report/analyse]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/report/negatives
 * Body (JSON): { keywords: string[], threshold?: { clicks: number, orders: number } }
 *
 * Takes a list of search terms and suggests negatives.
 */
router.post('/negatives', async (req, res) => {
  try {
    const { keywords, threshold = { clicks: 5, orders: 0 }, context } = req.body;

    if (!keywords?.length) return res.status(400).json({ error: '`keywords` array required' });

    const systemPrompt = `You are an Amazon PPC specialist. Review search terms and recommend which should be added as negative keywords.

Consider:
- Terms with clicks but zero conversions (above threshold)
- Irrelevant terms
- Duplicates or misspellings not worth targeting
- Terms that would cannibalise exact match campaigns

Return ONLY valid JSON:
{
  "negatives": [
    {
      "keyword": "string",
      "match_type": "negativeExact | negativePhrase",
      "reason": "string",
      "priority": "high | medium | low"
    }
  ],
  "keep": ["string"],
  "summary": "string"
}`;

    const formatted = Array.isArray(keywords)
      ? keywords.map(k => typeof k === 'string' ? k : `${k.keyword}${k.clicks ? ` [clicks:${k.clicks}]` : ''}${k.orders !== undefined ? ` [orders:${k.orders}]` : ''}`).join('\n')
      : String(keywords);

    const userMessage = `Context: ${context || 'Not provided'}
Threshold: ${threshold.clicks} clicks, ${threshold.orders} orders

Search terms:
${formatted}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({ success: true, ...result });

  } catch (err) {
    console.error('[report/negatives]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/report/sqp
 * Multipart form: file (SQP report CSV/XLSX)
 *
 * Specific handler for Amazon Search Query Performance reports.
 */
router.post('/sqp', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { context, asin } = req.body;

    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const { rows, totalRows } = normaliseKeywordReport(parsed);

    if (!totalRows) return res.status(400).json({ error: 'No data rows found' });

    const sample = rows.slice(0, 200);

    const systemPrompt = `You are an Amazon PPC specialist analysing a Search Query Performance (SQP) report.
SQP data shows organic and paid visibility for search queries against a specific ASIN.

Analyse and return:
1. Queries where organic rank is high but paid is absent (opportunity to harvest)
2. Queries where paid is present but organic rank is poor (PPC is propping up weak organic)
3. Queries with strong combined visibility (defend in exact)
4. Total addressable search volume estimate

Return ONLY valid JSON:
{
  "harvest_opportunities": [{ "keyword":"string", "signal":"string" }],
  "ppc_dependency": [{ "keyword":"string", "risk":"string" }],
  "defend_keywords": ["string"],
  "volume_estimate": "string",
  "campaign_actions": [{ "action":"string", "keywords":["string"], "campaign_type":"string" }],
  "summary": "string"
}`;

    const kwData = sample.map(r =>
      `${r.keyword}${r.volume !== null ? ` | vol:${r.volume}` : ''}${r.impressions !== null ? ` | impressions:${r.impressions}` : ''}${r.clicks !== null ? ` | clicks:${r.clicks}` : ''}`
    ).join('\n');

    const userMessage = `ASIN: ${asin || 'Not provided'}
Context: ${context || 'Not provided'}

SQP data (${sample.length} rows):
${kwData}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({
      success: true,
      file: { name: req.file.originalname, rows: totalRows },
      ...result,
    });

  } catch (err) {
    console.error('[report/sqp]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
