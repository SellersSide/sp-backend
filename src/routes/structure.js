const router = require('express').Router();
const { callClaude } = require('../services/claude');

/**
 * POST /api/structure/recommend
 * Body (JSON): {
 *   product: { pid, asin, category, description },
 *   keywords: { branded?, nonBranded?, competitor? },
 *   budget: number,
 *   goals?: string,
 *   existingCampaigns?: string
 * }
 *
 * Returns a full SP campaign structure recommendation tailored to the product.
 */
router.post('/recommend', async (req, res) => {
  try {
    const { product, keywords, budget, goals, existingCampaigns } = req.body;

    if (!product?.pid) return res.status(400).json({ error: '`product.pid` is required' });
    if (!budget) return res.status(400).json({ error: '`budget` is required' });

    const systemPrompt = `You are a senior Amazon PPC strategist at a UK-based Amazon agency.
Design a complete Sponsored Products campaign structure for a product.

The tool this integrates with supports these campaign types:
Standard Batch: AUTO_ALL, NB_EXACT, NB_PHRASE, PT_OFFENSIVE, CAT_REG, BR_EXACT, BR_PHRASE, BR_BROAD
Advanced Batch: AUTO_CLOSE, AUTO_LOOSE, AUTO_SUBSTITUTES, AUTO_COMPLEMENTS, NBSKC_EXACT, NBSKC_PHRASE, NB_EXACT, NB_PHRASE, BR_EXACT, BR_PHRASE, BR_BROAD, PT_OFFENSIVE, CAT_REG
Custom: any bespoke structure

Account for:
- Budget allocation across campaign types
- Match type hierarchy (exact → phrase → broad → auto funnel)
- Negative keyword cascade (exact keywords negated from phrase/broad/auto)
- NBSKC (single keyword campaigns) for top-priority terms

Return ONLY valid JSON:
{
  "recommended_structure": {
    "standard_batch": ["AUTO_ALL","NB_EXACT","NB_PHRASE"],
    "advanced_batch": [],
    "custom_campaigns": []
  },
  "budget_split": [
    { "campaign_type": "string", "suggested_pct": 0, "rationale": "string" }
  ],
  "nbskc_candidates": ["string"],
  "bidding_strategy": "Dynamic bids - down only | Dynamic bids - up and down | Fixed bid",
  "placement_recommendations": {
    "tos_pct": 0,
    "pp_pct": 0,
    "ros_pct": 0,
    "rationale": "string"
  },
  "priority_keywords": {
    "exact": [],
    "phrase": [],
    "broad": []
  },
  "negative_keywords": [],
  "phased_rollout": [
    { "phase": 1, "campaigns": [], "rationale": "string" }
  ],
  "summary": "string",
  "warnings": []
}`;

    const nbKws = keywords?.nonBranded || [];
    const brKws = keywords?.branded || [];
    const cmpKws = keywords?.competitor || [];

    const userMessage = `Product:
  PID: ${product.pid}
  ASIN: ${product.asin || 'Not provided'}
  Category: ${product.category || 'Not provided'}
  Description: ${product.description || 'Not provided'}

Daily Budget: £${budget}

Keywords:
  Non-Branded (${Array.isArray(nbKws) ? nbKws.length : 'pasted'}): ${Array.isArray(nbKws) ? nbKws.slice(0, 30).join(', ') : nbKws}
  Branded (${Array.isArray(brKws) ? brKws.length : 'pasted'}): ${Array.isArray(brKws) ? brKws.slice(0, 10).join(', ') : brKws}
  Competitor (${Array.isArray(cmpKws) ? cmpKws.length : 'pasted'}): ${Array.isArray(cmpKws) ? cmpKws.slice(0, 10).join(', ') : cmpKws}

Goals: ${goals || 'Not specified'}
Existing campaigns: ${existingCampaigns || 'None / launching fresh'}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({ success: true, ...result });

  } catch (err) {
    console.error('[structure/recommend]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/structure/audit
 * Body (JSON): { campaigns: Array<{name, type, spend, impressions, clicks, orders, acos}>, context? }
 *
 * Audits an existing campaign list and suggests improvements.
 */
router.post('/audit', async (req, res) => {
  try {
    const { campaigns, context } = req.body;

    if (!campaigns?.length) return res.status(400).json({ error: '`campaigns` array required' });

    const systemPrompt = `You are a senior Amazon PPC auditor. Review an existing SP campaign structure and provide actionable recommendations.

Assess:
- Missing campaign types in the funnel
- Budget distribution (are priority campaigns underfunded?)
- Cannibalisation risks
- Structural gaps (e.g. no exact campaigns to harvest from auto)
- Quick wins vs longer-term restructuring

Return ONLY valid JSON:
{
  "score": 0,
  "score_label": "Poor | Fair | Good | Excellent",
  "issues": [
    { "severity": "high | medium | low", "issue": "string", "recommendation": "string" }
  ],
  "missing_campaign_types": ["string"],
  "quick_wins": ["string"],
  "structural_changes": ["string"],
  "summary": "string"
}`;

    const formatted = campaigns.map(c =>
      `${c.name} | type:${c.type || '?'} | spend:${c.spend || '?'} | clicks:${c.clicks || '?'} | orders:${c.orders || '?'} | acos:${c.acos || '?'}`
    ).join('\n');

    const userMessage = `Context: ${context || 'Not provided'}

Campaigns (${campaigns.length}):
${formatted}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({ success: true, ...result });

  } catch (err) {
    console.error('[structure/audit]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/structure/naming
 * Body (JSON): { pid, campaignTypes: string[], marketplace?: string }
 *
 * Generates campaign naming conventions for a given product + campaign types.
 */
router.post('/naming', async (req, res) => {
  try {
    const { pid, campaignTypes, marketplace = 'UK' } = req.body;

    if (!pid) return res.status(400).json({ error: '`pid` is required' });
    if (!campaignTypes?.length) return res.status(400).json({ error: '`campaignTypes` array required' });

    const systemPrompt = `You are an Amazon PPC specialist. Generate campaign names following the agency's naming convention.

Standard naming pattern: {PID}_SP_{TYPE}_{MODIFIER}
Examples:
  BoxingGloves_SP_NB_EXACT
  BoxingGloves_SP_AUTO_ALL
  BoxingGloves_SP_BR_PHRASE
  BoxingGloves_SP_NBSKC_EXACT_boxing-gloves

Return ONLY valid JSON:
{
  "campaign_names": [
    { "type": "string", "name": "string", "ad_group_name": "string" }
  ]
}`;

    const userMessage = `PID: ${pid}
Marketplace: ${marketplace}
Campaign types requested: ${campaignTypes.join(', ')}`;

    const result = await callClaude({ systemPrompt, userMessage });

    res.json({ success: true, ...result });

  } catch (err) {
    console.error('[structure/naming]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
