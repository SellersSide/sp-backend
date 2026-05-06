# SP Bulk Upload Generator — Backend

Node.js/Express backend for the SP Bulk Upload Generator. Handles file parsing and Claude AI processing for keyword bucketing, report analysis, and campaign structure recommendations.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/keywords/bucket` | Bucket a keyword list by intent |
| POST | `/api/keywords/sort` | Sort/tier keywords by opportunity |
| POST | `/api/keywords/upload` | Upload CSV/XLSX + bucket or sort |
| POST | `/api/report/analyse` | Full keyword report analysis |
| POST | `/api/report/negatives` | Identify negative keyword candidates |
| POST | `/api/report/sqp` | Amazon SQP report analysis |
| POST | `/api/structure/recommend` | Full campaign structure recommendation |
| POST | `/api/structure/audit` | Audit existing campaign list |
| POST | `/api/structure/naming` | Generate campaign names |

---

## Deploy to Railway

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial backend"
git remote add origin https://github.com/YOUR_ORG/sp-backend.git
git push -u origin main
```

### 2. Create Railway project
- Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
- Select this repo

### 3. Set environment variables in Railway
In your Railway project → Variables, add:
```
ANTHROPIC_API_KEY=sk-ant-...
NODE_ENV=production
```
Railway sets `PORT` automatically — do not override it.

### 4. Add a custom domain (optional)
- Railway project → Settings → Networking → Custom Domain
- Add `api.sellersside.com` (or similar)
- Add a CNAME in your DNS: `api` → `your-service.up.railway.app`

### 5. Update CORS
In `src/index.js`, add your Base44 frontend URL to `allowedOrigins` once you have it.

---

## Local development

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY in .env

npm install
npm run dev
```

Server runs at `http://localhost:3000`

---

## Request examples

### Bucket keywords (JSON body)
```bash
curl -X POST http://localhost:3000/api/keywords/bucket \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["boxing gloves", "best boxing gloves", "everlast gloves"], "context": "Boxing equipment brand"}'
```

### Upload a keyword CSV
```bash
curl -X POST http://localhost:3000/api/keywords/upload \
  -F "file=@keywords.csv" \
  -F "context=Boxing equipment" \
  -F "task=bucket"
```

### Campaign structure recommendation
```bash
curl -X POST http://localhost:3000/api/structure/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "product": { "pid": "BoxingGloves12oz", "asin": "B075G2VHPT", "category": "Sports" },
    "keywords": { "nonBranded": ["boxing gloves", "mma gloves"], "branded": ["mybrand"] },
    "budget": 30,
    "goals": "Launch — maximise visibility"
  }'
```

---

## File upload formats

Accepted: `.csv`, `.xlsx`, `.xls`

Auto-detects columns from:
- Amazon Search Query Performance (SQP)
- Helium 10 Cerebro / Magnet exports
- Data Dive exports
- Generic keyword + volume format

Required: at least one keyword/search term column.
Optional but used if present: search volume, clicks, orders/conversions, impressions.
