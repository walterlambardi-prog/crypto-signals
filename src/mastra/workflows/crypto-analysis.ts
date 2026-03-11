import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { saveReport, generateReportId } from '../reports/storage';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FEAR_GREED_API = 'https://api.alternative.me/fng';

// ─── Schemas ─────────────────────────────────────────────────────────

const coinDataSchema = z.object({
  coinId: z.string(),
  name: z.string(),
  symbol: z.string(),
  currentPrice: z.number(),
  marketCap: z.number(),
  volume24h: z.number(),
  priceChange24h: z.number(),
  priceChangePercentage24h: z.number(),
  high24h: z.number(),
  low24h: z.number(),
  rsi: z.number().nullable(),
  sma20: z.number().nullable(),
  sma50: z.number().nullable(),
  sma200: z.number().nullable(),
  macdHistogram: z.number().nullable(),
  bollingerUpper: z.number().nullable(),
  bollingerLower: z.number().nullable(),
  supportLevel: z.number(),
  resistanceLevel: z.number(),
  fearGreedIndex: z.number(),
  fearGreedLabel: z.string(),
  overallSignal: z.string(),
  signalScore: z.number(),
  signalSummary: z.string(),
});

// ─── TA Helper Functions ─────────────────────────────────────────────

function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((s, p) => s + p, 0) / period;
}

function calculateEMAArray(prices: number[], period: number): number[] | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  out.push(ema);
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * k + ema;
    out.push(ema);
  }
  return out;
}

function calculateRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  let avgGain = 0,
    avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    if (changes[i] >= 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
    }
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calculateMACD(prices: number[]): { histogram: number } | null {
  if (prices.length < 35) return null;
  const ema12 = calculateEMAArray(prices, 12);
  const ema26 = calculateEMAArray(prices, 26);
  if (!ema12 || !ema26) return null;

  const macdArr: number[] = [];
  const offset = 25;
  for (let i = offset; i < prices.length; i++) {
    const i12 = i - (prices.length - ema12.length);
    const i26 = i - offset;
    if (i12 >= 0 && i26 >= 0 && i12 < ema12.length && i26 < ema26.length) {
      macdArr.push(ema12[i12] - ema26[i26]);
    }
  }
  if (macdArr.length < 9) return null;

  const k = 2 / 10;
  let signal = macdArr.slice(0, 9).reduce((s, v) => s + v, 0) / 9;
  for (let i = 9; i < macdArr.length; i++) signal = (macdArr[i] - signal) * k + signal;

  const lastMacd = macdArr.at(-1);
  if (lastMacd === undefined) return null;

  return { histogram: lastMacd - signal };
}

function calculateBollinger(prices: number[], period = 20) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const mid = slice.reduce((s, p) => s + p, 0) / period;
  const std = Math.sqrt(slice.reduce((s, p) => s + (p - mid) ** 2, 0) / period);
  return { upper: mid + 2 * std, middle: mid, lower: mid - 2 * std };
}

// ─── Signal Scoring ──────────────────────────────────────────────────

type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

interface IndicatorResult {
  name: string;
  signal: SignalDirection;
  score: number;
  weight: number;
}

function scoreRSI(rsi: number): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;
  if (rsi < 20) { signal = 'BULLISH'; score = 100; }
  else if (rsi < 30) { signal = 'BULLISH'; score = 60; }
  else if (rsi > 80) { signal = 'BEARISH'; score = -100; }
  else if (rsi > 70) { signal = 'BEARISH'; score = -60; }
  else if (rsi < 45) { score = 20; }
  else if (rsi > 55) { score = -20; }
  return { name: 'RSI (14)', signal, score, weight: 2 };
}

function scoreSMA(name: string, currentPrice: number, sma: number, weight: number): IndicatorResult {
  const isBullish = currentPrice > sma;
  const magnitude = weight === 2 ? 70 : weight === 1.5 ? 50 : 30;
  return { name, signal: isBullish ? 'BULLISH' : 'BEARISH', score: isBullish ? magnitude : -magnitude, weight };
}

function scoreMACDHistogram(histogram: number): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;
  if (histogram > 0) { signal = 'BULLISH'; score = 45; }
  else if (histogram < 0) { signal = 'BEARISH'; score = -45; }
  return { name: 'MACD', signal, score, weight: 2 };
}

function scoreBollinger(
  currentPrice: number,
  bollinger: { upper: number; middle: number; lower: number },
): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;
  const bandWidth = bollinger.upper - bollinger.lower;
  if (currentPrice <= bollinger.lower + bandWidth * 0.1) { signal = 'BULLISH'; score = 50; }
  else if (currentPrice >= bollinger.upper - bandWidth * 0.1) { signal = 'BEARISH'; score = -50; }
  return { name: 'Bollinger Bands', signal, score, weight: 1.5 };
}

function computeOverallSignal(
  currentPrice: number,
  rsi: number | null,
  sma20: number | null,
  sma50: number | null,
  sma200: number | null,
  macdHistogram: number | null,
  bollinger: { upper: number; middle: number; lower: number } | null,
): { overallSignal: string; signalScore: number; signalSummary: string } {
  const results: IndicatorResult[] = [];

  if (rsi !== null) results.push(scoreRSI(rsi));
  if (sma20 !== null) results.push(scoreSMA('SMA (20)', currentPrice, sma20, 1));
  if (sma50 !== null) results.push(scoreSMA('SMA (50)', currentPrice, sma50, 1.5));
  if (sma200 !== null) results.push(scoreSMA('SMA (200)', currentPrice, sma200, 2));
  if (macdHistogram !== null) results.push(scoreMACDHistogram(macdHistogram));
  if (bollinger !== null) results.push(scoreBollinger(currentPrice, bollinger));

  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const raw = totalWeight > 0
    ? results.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight
    : 0;
  const score = Math.max(-100, Math.min(100, Math.round(raw)));

  let signal: string;
  if (score >= 50) signal = 'STRONG_BUY';
  else if (score >= 20) signal = 'BUY';
  else if (score > -20) signal = 'HOLD';
  else if (score > -50) signal = 'SELL';
  else signal = 'STRONG_SELL';

  const bullish = results.filter((r) => r.signal === 'BULLISH').length;
  const bearish = results.filter((r) => r.signal === 'BEARISH').length;
  const neutral = results.filter((r) => r.signal === 'NEUTRAL').length;
  const summary = `${signal} (score: ${score}/100). ${bullish} bullish, ${bearish} bearish, ${neutral} neutral indicators.`;

  return { overallSignal: signal, signalScore: score, signalSummary: summary };
}

// ─── Step 1: Fetch Data + Compute TA ─────────────────────────────────

const fetchAndAnalyze = createStep({
  id: 'fetch-and-analyze',
  description: 'Fetches current price, historical data, computes technical indicators, and market sentiment for a cryptocurrency',
  inputSchema: z.object({
    coinId: z.string().describe('CoinGecko coin ID (e.g., "bitcoin")'),
  }),
  outputSchema: coinDataSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data not found');

    // Fetch all data in parallel
    const [marketRes, historyRes, fgRes] = await Promise.all([
      fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(inputData.coinId)}&sparkline=false`,
      ),
      fetch(
        `${COINGECKO_BASE}/coins/${encodeURIComponent(inputData.coinId)}/market_chart?vs_currency=usd&days=200`,
      ),
      fetch(`${FEAR_GREED_API}/?limit=1`),
    ]);

    if (!marketRes.ok) throw new Error(`CoinGecko markets error: ${marketRes.status}`);
    if (!historyRes.ok) throw new Error(`CoinGecko history error: ${historyRes.status}`);

    const marketData = (await marketRes.json()) as any[];
    const historyData = (await historyRes.json()) as { prices: [number, number][] };

    if (!marketData[0]) throw new Error(`Coin "${inputData.coinId}" not found`);

    const coin = marketData[0];
    const closingPrices = historyData.prices.map(([, p]: [number, number]) => p);
    const recentPrices = closingPrices.slice(-30);

    // Fear & Greed
    let fgValue = 50;
    let fgLabel = 'Neutral';
    if (fgRes.ok) {
      const fgData = (await fgRes.json()) as { data: { value: string; value_classification: string }[] };
      if (fgData.data?.[0]) {
        fgValue = Number.parseInt(fgData.data[0].value, 10);
        fgLabel = fgData.data[0].value_classification;
      }
    }

    // Compute TA
    const rsi = calculateRSI(closingPrices);
    const sma20 = calculateSMA(closingPrices, 20);
    const sma50 = calculateSMA(closingPrices, 50);
    const sma200 = calculateSMA(closingPrices, 200);
    const macd = calculateMACD(closingPrices);
    const boll = calculateBollinger(closingPrices);

    // Compute overall signal score
    const { overallSignal, signalScore, signalSummary } = computeOverallSignal(
      coin.current_price,
      rsi,
      sma20,
      sma50,
      sma200,
      macd?.histogram ?? null,
      boll,
    );

    return {
      coinId: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      currentPrice: coin.current_price,
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      priceChange24h: coin.price_change_24h,
      priceChangePercentage24h: coin.price_change_percentage_24h,
      high24h: coin.high_24h,
      low24h: coin.low_24h,
      rsi: rsi === null ? null : Number.parseFloat(rsi.toFixed(2)),
      sma20: sma20 === null ? null : Number.parseFloat(sma20.toFixed(2)),
      sma50: sma50 === null ? null : Number.parseFloat(sma50.toFixed(2)),
      sma200: sma200 === null ? null : Number.parseFloat(sma200.toFixed(2)),
      macdHistogram: macd?.histogram === undefined ? null : Number.parseFloat(macd.histogram.toFixed(2)),
      bollingerUpper: boll?.upper === undefined ? null : Number.parseFloat(boll.upper.toFixed(2)),
      bollingerLower: boll?.lower === undefined ? null : Number.parseFloat(boll.lower.toFixed(2)),
      supportLevel: Number.parseFloat(Math.min(...recentPrices).toFixed(2)),
      resistanceLevel: Number.parseFloat(Math.max(...recentPrices).toFixed(2)),
      fearGreedIndex: fgValue,
      fearGreedLabel: fgLabel,
      overallSignal,
      signalScore,
      signalSummary,
    };
  },
});

// ─── Step 2: Generate Analysis Report via Agent ──────────────────────

const generateReport = createStep({
  id: 'generate-analysis-report',
  description: 'Uses the crypto signals agent to generate a comprehensive analysis and trading signal report',
  inputSchema: coinDataSchema,
  outputSchema: z.object({
    report: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Analysis data not found');

    const agent = mastra?.getAgent('cryptoSignalsAgent');
    if (!agent) throw new Error('Crypto signals agent not found');

    const prompt = `Generate a comprehensive trading analysis report based on the following data. DO NOT call any tools — all data is provided below.

**${inputData.name} (${inputData.symbol})**

📊 Market Data:
• Current Price: $${inputData.currentPrice}
• 24h Change: ${inputData.priceChangePercentage24h > 0 ? '+' : ''}${inputData.priceChangePercentage24h.toFixed(2)}% ($${inputData.priceChange24h.toFixed(2)})
• 24h High/Low: $${inputData.high24h} / $${inputData.low24h}
• Market Cap: $${(inputData.marketCap / 1e9).toFixed(2)}B
• 24h Volume: $${(inputData.volume24h / 1e9).toFixed(2)}B

📈 Technical Indicators:
• RSI (14): ${inputData.rsi ?? 'N/A'}
• SMA 20: ${inputData.sma20 === null ? 'N/A' : '$' + inputData.sma20}
• SMA 50: ${inputData.sma50 === null ? 'N/A' : '$' + inputData.sma50}
• SMA 200: ${inputData.sma200 === null ? 'N/A' : '$' + inputData.sma200}
• MACD Histogram: ${inputData.macdHistogram ?? 'N/A'}
• Bollinger Bands: Upper $${inputData.bollingerUpper ?? 'N/A'} / Lower $${inputData.bollingerLower ?? 'N/A'}
• Support: $${inputData.supportLevel} | Resistance: $${inputData.resistanceLevel}

🧠 Market Sentiment:
• Fear & Greed Index: ${inputData.fearGreedIndex}/100 (${inputData.fearGreedLabel})

🎯 Quantitative Signal (computed from indicators):
• Overall Signal: ${inputData.overallSignal}
• Signal Score: ${inputData.signalScore}/100
• Summary: ${inputData.signalSummary}

Please provide:
1. Your assessment of the computed signal (${inputData.overallSignal}, score ${inputData.signalScore}/100) — do you agree? Explain why or why not
2. Detailed analysis of each indicator and what it means
3. Key support and resistance levels
4. Risk assessment
5. Short-term (1-7 days) and medium-term (1-4 weeks) outlook
6. Actionable recommendations

Use structured formatting with emojis and clear sections. Include a disclaimer.`;

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
  id: 'save-html-report',
  description: 'Persists the analysis report so it can be viewed via the /reports HTTP dashboard',
  inputSchema: z.object({
    report: z.string(),
  }),
  outputSchema: z.object({
    report: z.string(),
    reportId: z.string(),
    reportUrl: z.string(),
  }),
  execute: async ({ inputData, getInitData }) => {
    if (!inputData?.report?.trim()) {
      throw new Error('Cannot save an empty report — the analysis step produced no content.');
    }

    const initData = getInitData?.() as { coinId?: string } | undefined; // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    const coinId = initData?.coinId || 'unknown';

    const reportId = generateReportId('analysis', coinId);
    const title = `${coinId.charAt(0).toUpperCase() + coinId.slice(1)} Analysis`;

    await saveReport({
      id: reportId,
      type: 'analysis',
      title,
      report: inputData.report,
      coinId,
      createdAt: new Date().toISOString(),
    });

    return {
      report: inputData.report,
      reportId,
      reportUrl: `/reports/${reportId}`,
    };
  },
});

// ─── Workflow Definition ─────────────────────────────────────────────

const cryptoAnalysisWorkflow = createWorkflow({
  id: 'crypto-analysis-workflow',
  inputSchema: z.object({
    coinId: z.string().describe('CoinGecko coin ID (e.g., "bitcoin", "ethereum", "solana")'),
  }),
  outputSchema: z.object({
    report: z.string(),
    reportId: z.string(),
    reportUrl: z.string(),
  }),
})
  .then(fetchAndAnalyze)
  .then(generateReport)
  .then(saveHtmlReport);

cryptoAnalysisWorkflow.commit();

export { cryptoAnalysisWorkflow };
