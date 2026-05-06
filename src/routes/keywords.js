const router = require('express').Router();
const { upload } = require('../middleware/upload');
const { parseFile, normaliseKeywordReport } = require('../services/fileParser');
const { callClaude } = require('../services/claude');

/**
 * POST /api/keywords/bucket
 * Body (JSON): { keywords: string[] | string, context?: string }
 *
 * Takes a flat list of keywords and buckets them by intent/use case
 * ready to map into campaign types.
 */
router.post('/bucket', async (req, res) => {
  try {
    const { keywords, context } = req.body;

    if (!keywords) return res.status(400).json({ error: '`keywords` is required' });

    const kwList = Array.isArray(keywords)
      ? keywords
      : String(keywords).split(/[\n,]+/).map(k => k.trim()).filter(Boolean);

    if (!kwList.length) return res.status(400).json({ error: 'No keywords provided' });
    if (kwList.length > 500) return res.status(400).json({ error: 'Max 500 keywords per request' });

    const systemPrompt = `You are an Amazon PPC specialist working for a UK-based Amazon agency. 
Your job is to bucket keyword lists into campaign-ready groups based on intent and use case.

Bucket definitions:
- branded: Contains a specific brand name
- competitor: Refers to a competitor brand or product
- high_intent: Strong purchase intent (e.g. "buy X", "X for sale", specific product descriptors)
- informational: Research or informational queries
- long_tail: 4+ word, specific, lower volume but high relevance
- broad_generic: Short, generic terms — high volume, lower intent
- seasonal: Holiday, event, or season-specific terms
- gifting: Gift-related queries

Return ONLY valid JSON in this exact shape — no explanation, no markdown:
{
  "buckets": {
    "branded": [],
    "competitor": [],
    "high_intent": [],
    "informational": [],
    "long_tail": [],
    "broad_generic": [],
    "seasonal": [],
    "gifting": []
  },
  "summary": "1-2 sentence summary of what you found",
  "campaign_recommendations": [
    {
      "campaign_type": "NB_EXACT | NB_PHRASE | BR_EXACT | etc",
      "bucket": "which bucket feeds this",
      "rationale": "why"
    }
  ]
}`;

    const userMessage = `Product context: ${context || 'Not provided'}

Keywords to bucket (${kwList.length} total):
${kwList.join('\n')}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({ success: true, input_count: kwList.length, ...result });

  } catch (err) {
    console.error('[keywords/bucket]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/keywords/sort
 * Body (JSON): { keywords: Array<{keyword, volume?, clicks?, orders?}> | string[], sortBy?: string }
 *
 * Sorts and scores keywords. Returns ranked list with tier labels.
 */
router.post('/sort', async (req, res) => {
  try {
    const { keywords, sortBy = 'opportunity', context } = req.body;

    if (!keywords) return res.status(400).json({ error: '`keywords` is required' });

    const kwList = Array.isArray(keywords) ? keywords : [];
    if (!kwList.length) return res.status(400).json({ error: 'No keywords provided' });
    if (kwList.length > 500) return res.status(400).json({ error: 'Max 500 keywords per request' });

    const systemPrompt = `You are an Amazon PPC specialist. Sort and tier keywords for an Amazon Sponsored Products campaign.

Tiers:
- tier_1: Top priority — high volume + high intent or high converting. Should be in exact match campaigns.
- tier_2: Mid priority — good volume or good intent. Phrase match candidates.
- tier_3: Lower priority — low volume or broad/generic. Broad or broad-modified candidates.
- exclude: Irrelevant, duplicate or very low value.

Sort criteria: ${sortBy} (options: opportunity | volume | conversion | alphabetical)

Return ONLY valid JSON:
{
  "sorted": [
    {
      "keyword": "string",
      "volume": number | null,
      "tier": "tier_1 | tier_2 | tier_3 | exclude",
      "reason": "brief reason"
    }
  ],
  "tier_counts": { "tier_1": 0, "tier_2": 0, "tier_3": 0, "exclude": 0 },
  "summary": "string"
}`;

    const formatted = kwList.map(k => {
      if (typeof k === 'string') return k;
      return `${k.keyword}${k.volume ? ` [vol:${k.volume}]` : ''}${k.orders ? ` [orders:${k.orders}]` : ''}`;
    }).join('\n');

    const userMessage = `Context: ${context || 'Not provided'}

Keywords (${kwList.length}):
${formatted}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({ success: true, input_count: kwList.length, ...result });

  } catch (err) {
    console.error('[keywords/sort]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/keywords/upload
 * Multipart form: file (CSV or XLSX) + optional fields: context, task
 *
 * Accepts a keyword report file, parses it, then buckets/sorts via Claude.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { context, task = 'bucket' } = req.body;

    // Parse file
    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const { rows, detectedColumns, totalRows } = normaliseKeywordReport(parsed);

    if (totalRows === 0) return res.status(400).json({ error: 'No keyword rows found in file' });

    // Limit to 300 rows for Claude context window
    const sample = rows.slice(0, 300);
    const truncated = totalRows > 300;

    // Build keyword list for Claude
    const kwList = sample.map(r => ({
      keyword: r.keyword,
      volume: r.volume,
      clicks: r.clicks,
      orders: r.orders,
    }));

    // Reuse bucket or sort logic
    let result;
    if (task === 'sort') {
      const fakeReq = { body: { keywords: kwList, context } };
      // Call sort logic inline
      result = await sortKeywordsWithClaude(kwList, context);
    } else {
      result = await bucketKeywordsWithClaude(kwList.map(k => k.keyword), context);
    }

    res.json({
      success: true,
      file: { name: req.file.originalname, rows: totalRows, truncated, detectedColumns },
      ...result,
    });

  } catch (err) {
    console.error('[keywords/upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Shared helpers (also used by upload route)

async function bucketKeywordsWithClaude(kwArray, context) {
  const systemPrompt = `You are an Amazon PPC specialist working for a UK-based Amazon agency. 
Bucket keyword lists into campaign-ready groups based on intent and use case.

Buckets: branded, competitor, high_intent, informational, long_tail, broad_generic, seasonal, gifting.

Return ONLY valid JSON:
{
  "buckets": { "branded":[], "competitor":[], "high_intent":[], "informational":[], "long_tail":[], "broad_generic":[], "seasonal":[], "gifting":[] },
  "summary": "string",
  "campaign_recommendations": [{ "campaign_type": "string", "bucket": "string", "rationale": "string" }]
}`;

  const userMessage = `Context: ${context || 'Not provided'}\n\nKeywords:\n${kwArray.join('\n')}`;
  return callClaude({ systemPrompt, userMessage });
}

async function sortKeywordsWithClaude(kwList, context) {
  const systemPrompt = `You are an Amazon PPC specialist. Sort and tier keywords.
Tiers: tier_1 (exact match), tier_2 (phrase), tier_3 (broad), exclude.
Return ONLY valid JSON:
{
  "sorted": [{ "keyword":"string","volume":null,"tier":"tier_1","reason":"string" }],
  "tier_counts": {"tier_1":0,"tier_2":0,"tier_3":0,"exclude":0},
  "summary":"string"
}`;

  const formatted = kwList.map(k =>
    `${k.keyword}${k.volume ? ` [vol:${k.volume}]` : ''}${k.orders ? ` [orders:${k.orders}]` : ''}`
  ).join('\n');

  const userMessage = `Context: ${context || 'Not provided'}\n\nKeywords:\n${formatted}`;
  return callClaude({ systemPrompt, userMessage });
}

module.exports = router;
