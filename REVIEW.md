# Crypto Signals — Code Review & Architecture Documentation

> Generated: March 11, 2026
> Framework: Mastra AI (`@mastra/core@^1.11.0`)
> Language: TypeScript (ES2022, strict mode)
> LLM: `google/gemini-2.5-pro`

---

## 1. Architecture Overview

```
src/mastra/
├── index.ts                    # Mastra entrypoint — wires agents, workflows, storage, routes
├── agents/
│   └── crypto-agent.ts         # Single agent with 4 tools + memory
├── tools/
│   ├── index.ts                # Barrel exports
│   ├── crypto-price.ts         # CoinGecko price/market data
│   ├── crypto-market.ts        # Top N coins + global metrics
│   ├── technical-analysis.ts   # RSI, SMA, EMA, MACD, Bollinger — full TA suite
│   └── crypto-sentiment.ts     # Fear & Greed Index + trending coins
├── workflows/
│   ├── crypto-analysis.ts      # 3-step: fetch+TA → agent report → save HTML
│   └── market-scan.ts          # 3-step: market snapshot → agent opportunities → save HTML
├── scorers/
│   └── crypto-scorer.ts        # LLM-judged signal quality evaluator
└── reports/
    ├── index.ts                # Barrel exports
    ├── html-templates.ts       # Dashboard + report HTML generators (dark theme)
    ├── storage.ts              # LibSQL persistence for reports (mastra-reports.db)
    └── routes.ts               # 4 HTTP endpoints via registerApiRoute
```

### Data Flow

```
User/Studio → Agent (4 tools) → CoinGecko/FearGreed APIs → Structured response
                                        │
Workflow trigger → Step 1 (fetch + compute TA) → Step 2 (agent generates report)
                                                       → Step 3 (save to LibSQL)
                                                              → HTTP /reports
```

### External APIs

| API | Base URL | Rate Limit | Usage |
|-----|----------|------------|-------|
| CoinGecko (free) | `https://api.coingecko.com/api/v3` | ~10-30 req/min | Prices, markets, history, trending |
| Fear & Greed | `https://api.alternative.me/fng` | Generous | Market sentiment index |

### Databases

| Database | Engine | Purpose |
|----------|--------|---------|
| `mastra.db` | LibSQL (via `@mastra/libsql`) | Mastra internal storage (memory, state) |
| `mastra-reports.db` | LibSQL (via `@libsql/client`) | Custom reports persistence |

### HTTP Endpoints (port 4111)

| Method | Path | Response |
|--------|------|----------|
| GET | `/reports` | HTML dashboard (filterable: `?filter=analysis\|scan`) |
| GET | `/reports/:id` | Individual report HTML |
| GET | `/reports/latest/:coinId` | Redirect to latest analysis for coin |
| DELETE | `/reports/:id` | JSON `{ success, deletedId }` |

---

## 2. Component Details

### 2.1 Tools

#### `get-crypto-price` (`crypto-price.ts`)
- **Input**: `coinIds` (comma-separated CoinGecko IDs), optional `currency`
- **Output**: Array of coin data (price, marketCap, volume, 24h changes, ATH)
- **API**: `/coins/markets`

#### `get-market-overview` (`crypto-market.ts`)
- **Input**: optional `limit` (1-100), optional `currency`
- **Output**: Global metrics (market cap, BTC dominance, volume) + top N coins
- **API**: `/global` + `/coins/markets` (parallel)

#### `get-technical-analysis` (`technical-analysis.ts`)
- **Input**: `coinId`, optional `days` (default 200, min 30), optional `currency`
- **Output**: Full indicator suite + overall signal (`STRONG_BUY`→`STRONG_SELL`)
- **API**: `/coins/{id}/market_chart`
- **Indicators**: RSI(14), SMA(20/50/200), EMA(12/26), MACD(12,26,9), Bollinger(20,2)
- **Signal scoring**: Weighted score → clamped to [-100, 100] → mapped to 5-tier signal

#### `get-market-sentiment` (`crypto-sentiment.ts`)
- **Input**: optional `includeTrending`
- **Output**: Fear & Greed Index + global metrics + trending coins + summary text
- **API**: Fear & Greed API + `/global` + `/search/trending` (parallel)

### 2.2 Agent (`crypto-agent.ts`)

- **ID**: `crypto-signals-agent`
- **Model**: `google/gemini-2.5-pro`
- **Tools**: All 4 tools registered
- **Memory**: `new Memory()` (default in-memory)
- **Instructions**: Detailed formatting guide, ticker→CoinGecko ID mapping, multilingual support

### 2.3 Workflows

#### `crypto-analysis-workflow` (`crypto-analysis.ts`)
1. **fetchAndAnalyze**: Fetches price + 200d history + Fear & Greed in parallel. Computes RSI, SMA(20/50/200), MACD, Bollinger. Has its own copy of TA functions.
2. **generateReport**: Sends structured data prompt to agent (stream mode). Agent produces markdown analysis.
3. **saveHtmlReport**: Persists to `mastra-reports.db` with coinId context.

#### `market-scan-workflow` (`market-scan.ts`)
1. **fetchMarketSnapshot**: Fetches global data + top N coins + Fear & Greed in parallel.
2. **identifyOpportunities**: Agent identifies top 3 opportunities, coins to avoid, sector trends.
3. **saveHtmlReport**: Persists as `scan` type report.

### 2.4 Scorer (`crypto-scorer.ts`)

- **Type**: LLM-judged (`agent` type)
- **Criteria**: hasSignal, hasTechnicalAnalysis, hasRiskWarning, hasDisclaimer, hasPriceData, hasActionableInsight
- **Scoring**: 60% weighted criteria + 40% LLM quality judgment
- **Judge model**: `google/gemini-2.5-pro`

### 2.5 Reports Module

- **Templates**: Dark-themed HTML with CSS variables. Dashboard has filter tabs + stat cards. Reports have markdown-to-HTML conversion.
- **Storage**: Lazy-initialized LibSQL client. Table auto-created on first operation. UPSERT semantics (`INSERT OR REPLACE`).
- **Routes**: 4 Hono routes via `registerApiRoute`.

---

## 3. Issues Found

### 🔴 Critical

#### P1: Duplicated Technical Analysis Functions
**Files**: `tools/technical-analysis.ts` + `workflows/crypto-analysis.ts`

`calculateSMA`, `calculateRSI`, `calculateEMAArray`, `calculateMACD`, and `calculateBollinger` are fully duplicated between the tool and the workflow. This means:
- Bugs fixed in one copy won't be fixed in the other
- Divergent behavior over time
- ~120 lines of unnecessary duplicated code

**Fix**: Extract shared functions to `src/mastra/utils/technical-indicators.ts` and import from both.

#### P2: Missing `.env.example`
The project uses `google/gemini-2.5-pro` which requires `GOOGLE_GENERATIVE_AI_API_KEY` (or similar). No `.env.example` exists to document required environment variables. New developers won't know what keys to set.

**Fix**: Create `.env.example` with all required/optional env vars.

#### P3: No CoinGecko Rate Limiting
CoinGecko free tier allows ~10-30 requests/min. The code has:
- `crypto-price.ts`: 1 request
- `crypto-market.ts`: 2 parallel requests
- `technical-analysis.ts`: 1 request
- `crypto-sentiment.ts`: 2-3 parallel requests
- `crypto-analysis.ts` workflow: 3 parallel requests
- `market-scan.ts` workflow: 3 parallel requests

Heavy usage (agent calling multiple tools, or workflows triggered in sequence) will easily hit rate limits. There's no retry/backoff logic — a 429 just throws an error.

**Fix**: Add a shared rate-limited fetch wrapper with exponential backoff retry.

#### P4: Agent Memory Not Persisted
```ts
memory: new Memory()
```
Default `Memory()` uses in-memory storage. All conversation history is lost on server restart. Should use the same LibSQL store for persistence.

**Fix**:
```ts
memory: new Memory({
  storage: new LibSQLStore({ url: 'file:./mastra.db' }),
})
```

### 🟡 Medium

#### P5: `any` Type Usage
- `crypto-analysis.ts:168`: `(await marketRes.json()) as any[]` — should use a typed interface
- `crypto-scorer.ts:94,104`: `(results as any)?.analyzeStepResult` — type safety gap in scorer results

**Fix**: Define proper interfaces for API responses and scorer intermediate results.

#### P6: Duplicated Constants
`COINGECKO_BASE` and `FEAR_GREED_API` are defined independently in 6 files. If the base URL needs to change (e.g., adding an API key param, switching to pro tier), you'd need to change all 6.

**Fix**: Create `src/mastra/utils/constants.ts` with centralized API URLs.

#### P7: `initReportsTable()` Called on Every Operation
Every storage function (`saveReport`, `listReports`, `getReport`, etc.) calls `initReportsTable()`. This runs a `CREATE TABLE IF NOT EXISTS` on every single database operation.

**Fix**: Initialize once at module load or use a lazy `initialized` flag:
```ts
let initialized = false;
async function ensureInitialized() {
  if (initialized) return;
  await initReportsTable();
  initialized = true;
}
```

#### P8: Dashboard Fetches All Reports, Filters in JS
In `routes.ts`, `listReports()` always fetches ALL reports regardless of the filter param. The filtering only happens in `generateDashboardHtml()`. This means the full dataset loads from DB even when filtering.

**Fix**: Pass `filter` to `listReports(filter)` which already supports it:
```ts
const reports = await listReports(filter); // Already supports filter param!
```

#### P9: No Error Handling / Retry on API Calls
All `fetch()` calls throw immediately on non-2xx responses:
```ts
if (!response.ok) {
  throw new Error(`CoinGecko API error: ${response.status}`);
}
```
No retry logic, no graceful degradation for intermittent network issues.

**Fix**: Add a retry wrapper with exponential backoff (max 3 attempts, 1s/2s/4s delays).

#### P10: `process.stdout.write(chunk)` in Workflows
Both `generateReport` (crypto-analysis) and `identifyOpportunities` (market-scan) write streamed text to stdout:
```ts
for await (const chunk of response.textStream) {
  process.stdout.write(chunk);
  report += chunk;
}
```
This is fine for development but pollutes logs in production.

**Fix**: Make conditional on a DEBUG flag or remove entirely (data is captured in `report` variable).

### 🟢 Low / Nice-to-Have

#### P11: No Tests
`package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`. No test framework configured.

**Suggestion**: Add Vitest + tests for TA calculation functions (pure functions, easy to test), and integration tests for tools.

#### P12: Naive Support/Resistance Calculation
Support and resistance are just `Math.min/max` of last 30 prices. Real TA uses:
- Swing highs/lows
- Volume-weighted levels
- Pivot points (classic, Fibonacci, Woodie)

**Suggestion**: Implement at least swing-based support/resistance detection.

#### P13: No Report Pagination or TTL
Reports accumulate forever. Dashboard loads all of them in one query. Over time:
- Database grows unbounded
- Dashboard gets slow with hundreds of reports

**Suggestion**: Add pagination (`?page=1&limit=20`) and optional TTL/auto-cleanup (e.g., delete reports older than 30 days).

#### P14: No CORS Headers
API routes don't set CORS headers. Fine for same-origin dashboard access, but external tools or frontends can't call the API.

**Suggestion**: Add CORS middleware if external access is needed.

#### P15: No Health Check / Status Endpoint
No way to check if the server is running and APIs are reachable without hitting a business endpoint.

**Suggestion**: Add `GET /health` returning `{ status: 'ok', uptime, … }`.

#### P16: Route Ordering — `/reports/latest/:coinId` vs `/reports/:id`
Both routes match the pattern `/reports/X`. If someone has a report ID starting with `latest`, there could be a conflict. Hono matches routes by registration order, so `latest/:coinId` being first should work, but it's fragile.

**Suggestion**: Consider renaming to `/reports/coin/:coinId/latest` for unambiguous routing.

#### P17: Markdown-to-HTML Converter Limitations
The `markdownToHtml()` function is a simple regex-based converter. Known limitations:
- Doesn't handle nested lists
- Doesn't handle code blocks (only inline code)
- `<ul>` wrapping regex is fragile and can produce malformed HTML
- Tables not supported

**Suggestion**: Fine for MVP. Consider using a library like `marked` or `markdown-it` if report formatting becomes important.

#### P18: Model Provider Dependency
`google/gemini-2.5-pro` requires the `@ai-sdk/google` provider. It's not listed as a direct dependency — likely resolved transitively through `@mastra/core`. If Mastra drops it or changes provider resolution, this breaks silently.

**Suggestion**: Add `@ai-sdk/google` as an explicit dependency for safety.

---

## 4. Suggested Improvements Roadmap

### Phase 1 — Quick Wins (same day)
- [ ] Create `.env.example` with required env vars
- [ ] Extract shared TA functions to `utils/technical-indicators.ts`
- [ ] Extract shared constants to `utils/constants.ts`
- [ ] Fix `listReports(filter)` in dashboard route (already supported!)
- [ ] Add `initialized` flag to reports storage
- [ ] Configure `Memory` with LibSQL for persistence
- [ ] Remove or guard `process.stdout.write` in workflows

### Phase 2 — Robustness (1-2 days)
- [ ] Add rate-limited fetch wrapper with retry/backoff for CoinGecko
- [ ] Type all API responses properly (remove `any` casts)
- [ ] Add `GET /health` endpoint
- [ ] Add basic pagination to reports dashboard
- [ ] Add `@ai-sdk/google` as explicit dependency

### Phase 3 — Quality (ongoing)
- [ ] Set up Vitest and write unit tests for TA calculations
- [ ] Improve support/resistance detection
- [ ] Add report TTL / cleanup job
- [ ] Consider swapping regex markdown converter for `marked`/`markdown-it`
- [ ] Add CORS middleware if external access needed
- [ ] Add WebSocket/SSE endpoint for live workflow progress

---

## 5. Environment Variables Required

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ | Google AI / Gemini API key for the LLM model |

---

## 6. How to Run

```bash
# Install dependencies
npm install

# Set up environment (create .env from .env.example)
cp .env.example .env
# Edit .env and add your GOOGLE_GENERATIVE_AI_API_KEY

# Start development server (Mastra Studio at localhost:4111)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Accessing Reports
- Dashboard: `http://localhost:4111/reports`
- Run `crypto-analysis-workflow` with input `{ "coinId": "bitcoin" }` from Mastra Studio
- Run `market-scan-workflow` with input `{}` or `{ "limit": 20 }` from Mastra Studio
- View generated reports on the dashboard

---

## 7. Dependencies

### Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| `@mastra/core` | ^1.11.0 | Framework core — agents, tools, workflows, server |
| `@mastra/memory` | ^1.6.2 | Agent conversation memory |
| `@mastra/libsql` | ^1.7.0 | LibSQL storage adapter for Mastra |
| `@mastra/evals` | ^1.1.2 | Evaluation / scoring framework |
| `@mastra/loggers` | ^1.0.2 | PinoLogger |
| `@mastra/observability` | ^1.4.0 | Tracing, exporters, sensitive data filter |
| `@libsql/client` | ^0.17.0 | Direct LibSQL access for reports DB |
| `zod` | ^4.3.6 | Schema validation |

### Dev
| Package | Version | Purpose |
|---------|---------|---------|
| `mastra` | ^1.3.8 | CLI (`mastra dev`, `mastra build`) |
| `typescript` | ^5.9.3 | Compiler |
| `@types/node` | ^25.4.0 | Node.js type definitions |

---

## 8. Key Design Decisions

1. **Separate DB for reports** (`mastra-reports.db`): Keeps custom data isolated from Mastra's internal state. Makes it easy to wipe reports without affecting agent memory.

2. **Server-side HTML rendering**: Reports are full HTML pages generated server-side. No frontend framework needed. Simple and zero-JS for the reader.

3. **Workflow steps duplicate API calls vs. tool calls**: Workflows fetch data directly from APIs rather than going through the tools. This avoids the tool→agent→tool loop and gives more control over parallel fetching.

4. **Agent streaming in workflows**: The agent responses are streamed (`agent.stream()`) and concatenated. This allows real-time output in dev via `process.stdout.write`.

5. **Signal scoring system**: Uses a weighted indicator scoring system (RSI weight 2, SMA200 weight 2, MACD weight 2, SMA50 weight 1.5, Bollinger weight 1.5, SMA20 weight 1). Score is clamped [-100, 100] and mapped to 5-tier signals.
