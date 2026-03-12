import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { saveReport, generateReportId } from '../reports/storage';
import { getActiveModelLabel } from '../reports/model-config';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FEAR_GREED_API = 'https://api.alternative.me/fng';

// ─── Schemas ─────────────────────────────────────────────────────────

const marketSnapshotSchema = z.object({
  fearGreedIndex: z.number(),
  fearGreedLabel: z.string(),
  totalMarketCap: z.number(),
  btcDominance: z.number(),
  marketCapChange24h: z.number(),
  topMovers: z.array(
    z.object({
      id: z.string(),
      symbol: z.string(),
      name: z.string(),
      price: z.number(),
      change24h: z.number(),
      change7d: z.number(),
      volume24h: z.number(),
      marketCap: z.number(),
    }),
  ),
  topGainers: z.array(
    z.object({
      symbol: z.string(),
      name: z.string(),
      change24h: z.number(),
    }),
  ),
  topLosers: z.array(
    z.object({
      symbol: z.string(),
      name: z.string(),
      change24h: z.number(),
    }),
  ),
});

// ─── Step 1: Fetch Market Snapshot ───────────────────────────────────

const fetchMarketSnapshot = createStep({
  id: 'fetch-market-snapshot',
  description: 'Fetches global market data, top coins, and sentiment',
  inputSchema: z.object({
    limit: z.number().optional().describe('Number of top coins to scan (default: 20)'),
  }),
  outputSchema: marketSnapshotSchema,
  execute: async ({ inputData }) => {
    const limit = inputData?.limit || 20;

    const [globalRes, marketsRes, fgRes] = await Promise.all([
      fetch(`${COINGECKO_BASE}/global`),
      fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&sparkline=false&price_change_percentage=7d`,
      ),
      fetch(`${FEAR_GREED_API}/?limit=1`),
    ]);

    if (!globalRes.ok || !marketsRes.ok) {
      throw new Error('Failed to fetch market data from CoinGecko');
    }

    const globalData = (await globalRes.json()) as {
      data: {
        total_market_cap: Record<string, number>;
        market_cap_percentage: Record<string, number>;
        market_cap_change_percentage_24h_usd: number;
      };
    };

    const marketsData = (await marketsRes.json()) as {
      id: string;
      symbol: string;
      name: string;
      current_price: number;
      price_change_percentage_24h: number;
      price_change_percentage_7d_in_currency?: number;
      total_volume: number;
      market_cap: number;
    }[];

    let fgValue = 50;
    let fgLabel = 'Neutral';
    if (fgRes.ok) {
      const fgData = (await fgRes.json()) as { data: { value: string; value_classification: string }[] };
      if (fgData.data?.[0]) {
        fgValue = Number.parseInt(fgData.data[0].value, 10);
        fgLabel = fgData.data[0].value_classification;
      }
    }

    const topMovers = marketsData.map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price,
      change24h: c.price_change_percentage_24h || 0,
      change7d: c.price_change_percentage_7d_in_currency || 0,
      volume24h: c.total_volume,
      marketCap: c.market_cap,
    }));

    const sorted = [...topMovers].sort((a, b) => b.change24h - a.change24h);
    const topGainers = sorted
      .filter((c) => c.change24h > 0)
      .slice(0, 5)
      .map((c) => ({ symbol: c.symbol, name: c.name, change24h: Number.parseFloat(c.change24h.toFixed(2)) }));
    const topLosers = sorted
      .filter((c) => c.change24h < 0)
      .slice(-5)
      .reverse()
      .map((c) => ({ symbol: c.symbol, name: c.name, change24h: Number.parseFloat(c.change24h.toFixed(2)) }));

    return {
      fearGreedIndex: fgValue,
      fearGreedLabel: fgLabel,
      totalMarketCap: globalData.data.total_market_cap['usd'] || 0,
      btcDominance: Number.parseFloat((globalData.data.market_cap_percentage['btc'] || 0).toFixed(2)),
      marketCapChange24h: Number.parseFloat(
        (globalData.data.market_cap_change_percentage_24h_usd || 0).toFixed(2),
      ),
      topMovers,
      topGainers,
      topLosers,
    };
  },
});

// ─── Step 2: Agent Identifies Opportunities ──────────────────────────

const identifyOpportunities = createStep({
  id: 'identify-opportunities',
  description: 'Uses the crypto signals agent to identify trading opportunities from market data',
  inputSchema: marketSnapshotSchema,
  outputSchema: z.object({
    report: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Market snapshot not found');

    const agent = mastra?.getAgent('cryptoSignalsAgent');
    if (!agent) throw new Error('Crypto signals agent not found');

    const prompt = `Analyze the following market snapshot and identify the best trading opportunities. DO NOT call any tools — all data is provided below.

🌍 **Global Market Overview**
• Total Market Cap: $${(inputData.totalMarketCap / 1e12).toFixed(2)}T (${inputData.marketCapChange24h > 0 ? '+' : ''}${inputData.marketCapChange24h}% 24h)
• BTC Dominance: ${inputData.btcDominance}%
• Fear & Greed: ${inputData.fearGreedIndex}/100 (${inputData.fearGreedLabel})

📈 **Top Gainers (24h):**
${inputData.topGainers.map((c) => `• ${c.symbol} (${c.name}): +${c.change24h}%`).join('\n')}

📉 **Top Losers (24h):**
${inputData.topLosers.map((c) => `• ${c.symbol} (${c.name}): ${c.change24h}%`).join('\n')}

📊 **Top ${inputData.topMovers.length} Coins:**
${inputData.topMovers
  .map(
    (c) =>
      `• ${c.symbol} $${c.price} | 24h: ${c.change24h > 0 ? '+' : ''}${c.change24h.toFixed(2)}% | 7d: ${c.change7d > 0 ? '+' : ''}${c.change7d.toFixed(2)}% | Vol: $${(c.volume24h / 1e9).toFixed(2)}B`,
  )
  .join('\n')}

Please provide:
1. **Market Mood Assessment** — Overall direction and sentiment analysis
2. **Top 3 Opportunities** — Coins worth watching with reasoning
3. **Coins to Avoid** — Which ones look risky right now and why
4. **Sector Trends** — Any notable patterns (L1s, DeFi, memes, etc.)
5. **Actionable Recommendations** — What to do today based on this data
6. **Risk Factors** — Key risks to monitor

Use structured formatting. Include disclaimer about not being financial advice.`;

    const response = await agent.stream([{ role: 'user', content: prompt }]);
    let report = '';
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      report += chunk;
    }

    const trimmed = report.trim();
    if (!trimmed) {
      throw new Error('Agent returned an empty report — aborting workflow. No report will be saved.');
    }

    return { report: trimmed };
  },
});

// ─── Step 3: Save HTML Report ────────────────────────────────────────

const saveHtmlReport = createStep({
  id: 'save-scan-html-report',
  description: 'Persists the market scan report so it can be viewed via the /reports HTTP dashboard',
  inputSchema: z.object({
    report: z.string(),
  }),
  outputSchema: z.object({
    report: z.string(),
    reportId: z.string(),
    reportUrl: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData?.report?.trim()) {
      throw new Error('Cannot save an empty report — the scan step produced no content.');
    }

    const reportId = generateReportId('scan');
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const title = `Market Scan — ${dateLabel}`;

    await saveReport({
      id: reportId,
      type: 'scan',
      title,
      report: inputData.report,
      createdAt: now.toISOString(),
      modelLabel: getActiveModelLabel(),
    });

    return {
      report: inputData.report,
      reportId,
      reportUrl: `/reports/${reportId}`,
    };
  },
});

// ─── Workflow Definition ─────────────────────────────────────────────

const marketScanWorkflow = createWorkflow({
  id: 'market-scan-workflow',
  inputSchema: z.object({
    limit: z.number().optional().describe('Number of top coins to scan (default: 20)'),
  }),
  outputSchema: z.object({
    report: z.string(),
    reportId: z.string(),
    reportUrl: z.string(),
  }),
})
  .then(fetchMarketSnapshot)
  .then(identifyOpportunities)
  .then(saveHtmlReport);

marketScanWorkflow.commit();

export { marketScanWorkflow };
