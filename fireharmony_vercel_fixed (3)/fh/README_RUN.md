# FireHarmony: NASA Space Apps 2026

Harmonizes MODIS and VIIRS active-fire satellite detections for Bangladesh. Built with automated PostgreSQL ingestion, single-linkage event fusion, and statistical sensor agreement.

---

## 1. Environment Variables

Configure these four required variables (locally in `.env`, in the AI Studio Secrets panel, or in Vercel Project Settings):

| Variable | Description |
| :--- | :--- |
| `FIRMS_MAP_KEY` | Your NASA FIRMS Map Key for fetching MODIS and VIIRS active-fire telemetry. |
| `DATABASE_URL` | PostgreSQL / Supabase pooled connection string (transaction mode compatible). |
| `CRON_SECRET` | Secret token used by Vercel Cron or external schedulers to authenticate `/api/ingest/tick`. |
| `ADMIN_PIN` | Secure PIN required to authorize ground validation reviews on `/api/validation/review`. |
| `DB_SIZE_LIMIT_MB` | *(Optional, default: `500`)* Storage safety limit in megabytes to prevent runaway database growth. |

> **Security Rule:** Never commit keys or paste them into chat. These variables are read strictly server-side and never exposed to the client bundle.

---

## 2. Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run test suite
npm test

# 3. Type check & Lint
npm run lint

# 4. Build frontend & simplify boundary geometry
npm run build

# 5. Start development full-stack server (Port 3000)
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 3. Vercel Deployment

1. **Import Repository**: Connect your Git repository to Vercel.
2. **Environment Variables**: Add `FIRMS_MAP_KEY`, `DATABASE_URL`, `CRON_SECRET`, and `ADMIN_PIN` under **Settings > Environment Variables**.
3. **Deploy to Production**: Deploy directly to the **Production** branch (note that Vercel Cron jobs only execute on Production deployments, not on preview environments).
4. `vercel.json` automatically configures:
   - Serverless functions for `/api/**/*.ts` with 300s execution budget.
   - Nightly cron job (`0 2 * * *`) targeting `/api/ingest/tick`.

---

## 4. Reading `/api/health`

The `/api/health` endpoint provides real-time diagnostic JSON:

```json
{
  "db_ok": true,
  "schema_ok": true,
  "boundaries_loaded": true,
  "districts_count": 64,
  "db_size_bytes": 14500000,
  "db_limit_bytes": 524288000,
  "detections_count": 18240,
  "last_tick": {
    "started_at": "...",
    "finished_at": "...",
    "status": "ok",
    "requests": 4,
    "rows_upserted": 120,
    "error": null
  },
  "products": [
    {
      "product": "VIIRS_SNPP_SP",
      "first_day": "2023-11-01",
      "last_day": "2024-04-30",
      "coverage_days": 182,
      "sp_days": 182,
      "nrt_days": 0,
      "backfill": {
        "cursor_date": "2023-11-01",
        "start_date": "2012-01-19",
        "done": false
      }
    }
  ],
  "key_present": true,
  "notes": []
}
```

- `db_ok`: True if connected to Postgres/Supabase.
- `schema_ok`: True if all required tables and indexes are initialized.
- `boundaries_loaded`: Confirms Bangladesh ADM0 and ADM2 geometries are loaded.
- `key_present`: Boolean indicating whether `FIRMS_MAP_KEY` is detected (the key itself is never exposed).

---

## 5. How Backfill Progresses

1. **Forward Ingestion**: Upon startup or cron trigger, the forward step fetches the last 5 days of near-real-time (`_NRT`) telemetry for MODIS, VIIRS SNPP, NOAA-20, and NOAA-21.
2. **Standard Processing (SP) Upgrade**: As NASA publishes validated Standard Processing archives (typically within 2–3 months), the engine queries NASA data availability, fetches SP rows, and cleanly replaces NRT rows in a single transaction.
3. **Gap Healing**: Identifies missing product-days between the product start date and today, fetching up to 40 chunks per tick (newest first).
4. **Historical Backfill**: Moves the `cursor_date` backward in 5-day chunks from the oldest stored day toward the satellite mission inception date (MODIS 2000, SNPP 2012, NOAA-20 2018).
5. **Storage Guard**: Evaluates database size before every insert chunk; if storage reaches 85% of `DB_SIZE_LIMIT_MB`, backfilling safely pauses without deleting existing records.
