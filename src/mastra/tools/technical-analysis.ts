import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// ─── Helpers ─────────────────────────────────────────────────────────

type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

function roundOrNull(val: number | null): number | null {
  return val === null ? null : Number.parseFloat(val.toFixed(2));
}

// ─── Technical Indicator Calculations ────────────────────────────────

function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateEMAArray(prices: number[], period: number): number[] | null {
  if (prices.length < period) return null;
  const multiplier = 2 / (period + 1);
  const emaArray: number[] = [];
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  emaArray.push(ema);
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
    emaArray.push(ema);
  }
  return emaArray;
}

function calculateEMAFromArray(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateMACD(prices: number[]): {
  macdLine: number;
  signalLine: number;
  histogram: number;
} | null {
  if (prices.length < 35) return null;

  const ema12 = calculateEMAArray(prices, 12);
  const ema26 = calculateEMAArray(prices, 26);
  if (!ema12 || !ema26) return null;

  const macdArray: number[] = [];
  const startIdx = 25;
  for (let i = startIdx; i < prices.length; i++) {
    const idx12 = i - (prices.length - ema12.length);
    const idx26 = i - startIdx;
    if (idx12 >= 0 && idx26 >= 0 && idx12 < ema12.length && idx26 < ema26.length) {
      macdArray.push(ema12[idx12] - ema26[idx26]);
    }
  }

  if (macdArray.length < 9) return null;

  const signalEMA = calculateEMAFromArray(macdArray, 9);
  if (signalEMA === null) return null;

  const macdLine = macdArray.at(-1);
  if (macdLine === undefined) return null;

  return { macdLine, signalLine: signalEMA, histogram: macdLine - signalEMA };
}

function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2,
): { upper: number; middle: number; lower: number; bandwidth: number } | null {
  if (prices.length < period) return null;

  const slice = prices.slice(-period);
  const middle = slice.reduce((sum, p) => sum + p, 0) / period;
  const variance = slice.reduce((sum, p) => sum + (p - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;

  return { upper, middle, lower, bandwidth: ((upper - lower) / middle) * 100 };
}

// ─── Signal Scoring (decomposed for low complexity) ──────────────────

interface IndicatorResult {
  name: string;
  value: string;
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

  return { name: 'RSI (14)', value: rsi.toFixed(2), signal, score, weight: 2 };
}

function scoreSMA(name: string, currentPrice: number, sma: number, weight: number): IndicatorResult {
  const isBullish = currentPrice > sma;
  const magnitude = weight === 2 ? 70 : weight === 1.5 ? 50 : 30;
  return {
    name,
    value: sma.toFixed(2),
    signal: isBullish ? 'BULLISH' : 'BEARISH',
    score: isBullish ? magnitude : -magnitude,
    weight,
  };
}

function scoreMACD(macd: { macdLine: number; signalLine: number; histogram: number }): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (macd.histogram > 0 && macd.macdLine > macd.signalLine) { signal = 'BULLISH'; score = 60; }
  else if (macd.histogram < 0 && macd.macdLine < macd.signalLine) { signal = 'BEARISH'; score = -60; }
  else if (macd.histogram > 0) { signal = 'BULLISH'; score = 30; }
  else if (macd.histogram < 0) { signal = 'BEARISH'; score = -30; }

  return {
    name: 'MACD',
    value: `Line: ${macd.macdLine.toFixed(2)}, Signal: ${macd.signalLine.toFixed(2)}, Hist: ${macd.histogram.toFixed(2)}`,
    signal,
    score,
    weight: 2,
  };
}

function scoreBollinger(
  currentPrice: number,
  bollinger: { upper: number; middle: number; lower: number; bandwidth: number },
): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;
  const bandWidth = bollinger.upper - bollinger.lower;

  if (currentPrice <= bollinger.lower + bandWidth * 0.1) { signal = 'BULLISH'; score = 50; }
  else if (currentPrice >= bollinger.upper - bandWidth * 0.1) { signal = 'BEARISH'; score = -50; }

  return {
    name: 'Bollinger Bands',
    value: `Upper: ${bollinger.upper.toFixed(2)}, Mid: ${bollinger.middle.toFixed(2)}, Lower: ${bollinger.lower.toFixed(2)}`,
    signal,
    score,
    weight: 1.5,
  };
}

function computeWeightedScore(results: IndicatorResult[]): { score: number; signal: string } {
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const raw = totalWeight > 0
    ? results.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight
    : 0;
  const clamped = Math.max(-100, Math.min(100, Math.round(raw)));

  let signal: string;
  if (clamped >= 50) signal = 'STRONG_BUY';
  else if (clamped >= 20) signal = 'BUY';
  else if (clamped > -20) signal = 'HOLD';
  else if (clamped > -50) signal = 'SELL';
  else signal = 'STRONG_SELL';

  return { score: clamped, signal };
}

function buildSummary(
  results: IndicatorResult[],
  overallSignal: string,
  score: number,
  rsi: number | null,
  macd: { histogram: number } | null,
  currentPrice: number,
  sma200: number | null,
): string {
  const bullish = results.filter((s) => s.signal === 'BULLISH').length;
  const bearish = results.filter((s) => s.signal === 'BEARISH').length;
  const neutral = results.filter((s) => s.signal === 'NEUTRAL').length;

  const parts = [
    `Signal: ${overallSignal} (score: ${score}/100).`,
    `${bullish} bullish, ${bearish} bearish, ${neutral} neutral indicators.`,
  ];

  if (rsi !== null) {
    const label = rsi < 30 ? ' (oversold)' : rsi > 70 ? ' (overbought)' : '';
    parts.push(`RSI at ${rsi.toFixed(1)}${label}.`);
  }
  if (macd !== null) {
    parts.push(`MACD histogram ${macd.histogram > 0 ? 'positive' : 'negative'}.`);
  }
  if (sma200 !== null) {
    parts.push(`Price ${currentPrice > sma200 ? 'above' : 'below'} 200-day SMA.`);
  }

  return parts.join(' ');
}

function generateOverallSignal(
  currentPrice: number,
  rsi: number | null,
  sma20: number | null,
  sma50: number | null,
  sma200: number | null,
  macd: { macdLine: number; signalLine: number; histogram: number } | null,
  bollinger: { upper: number; middle: number; lower: number; bandwidth: number } | null,
) {
  const results: IndicatorResult[] = [];

  if (rsi !== null) results.push(scoreRSI(rsi));
  if (sma20 !== null) results.push(scoreSMA('SMA (20)', currentPrice, sma20, 1));
  if (sma50 !== null) results.push(scoreSMA('SMA (50)', currentPrice, sma50, 1.5));
  if (sma200 !== null) results.push(scoreSMA('SMA (200)', currentPrice, sma200, 2));
  if (macd !== null) results.push(scoreMACD(macd));
  if (bollinger !== null) results.push(scoreBollinger(currentPrice, bollinger));

  const { score, signal } = computeWeightedScore(results);

  return {
    overallSignal: signal,
    signalScore: score,
    indicators: results.map(({ name, value, signal: s, weight }) => ({ name, value, signal: s, weight })),
    summary: buildSummary(results, signal, score, rsi, macd, currentPrice, sma200),
  };
}

// ─── Indicator Output Builders ───────────────────────────────────────

function buildRsiOutput(rsi: number | null) {
  if (rsi === null) return { value: null, signal: 'N/A' };
  const signal = rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL';
  return { value: roundOrNull(rsi), signal };
}

function buildSmaOutput(sma: number | null, currentPrice: number) {
  if (sma === null) return { value: null, signal: 'N/A' };
  return { value: roundOrNull(sma), signal: currentPrice > sma ? 'BULLISH' : 'BEARISH' };
}

function buildMacdOutput(macd: ReturnType<typeof calculateMACD>) {
  if (macd === null) {
    return { macdLine: null, signalLine: null, histogram: null, signal: 'N/A' };
  }
  return {
    macdLine: roundOrNull(macd.macdLine),
    signalLine: roundOrNull(macd.signalLine),
    histogram: roundOrNull(macd.histogram),
    signal: macd.histogram > 0 ? 'BULLISH' : ('BEARISH' as string),
  };
}

function buildBollingerOutput(
  bollinger: ReturnType<typeof calculateBollingerBands>,
  currentPrice: number,
) {
  if (bollinger === null) {
    return { upper: null, middle: null, lower: null, bandwidth: null, signal: 'N/A' };
  }
  const bandWidth = bollinger.upper - bollinger.lower;
  let signal = 'NEUTRAL';
  if (currentPrice <= bollinger.lower + bandWidth * 0.1) signal = 'OVERSOLD';
  else if (currentPrice >= bollinger.upper - bandWidth * 0.1) signal = 'OVERBOUGHT';

  return {
    upper: roundOrNull(bollinger.upper),
    middle: roundOrNull(bollinger.middle),
    lower: roundOrNull(bollinger.lower),
    bandwidth: roundOrNull(bollinger.bandwidth),
    signal,
  };
}

// ─── Tool Definition ─────────────────────────────────────────────────

export const getTechnicalAnalysis = createTool({
  id: 'get-technical-analysis',
  description:
    'Perform comprehensive technical analysis on a cryptocurrency. Fetches historical prices and computes RSI, SMA (20/50/200), EMA (12/26), MACD, Bollinger Bands, and generates a trading signal (STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL).',
  inputSchema: z.object({
    coinId: z
      .string()
      .describe('CoinGecko coin ID (e.g., "bitcoin", "ethereum", "solana")'),
    days: z
      .number()
      .optional()
      .describe('Number of days of historical data to analyze (default: 200). Minimum 30.'),
    currency: z
      .string()
      .optional()
      .describe('Target currency (default: "usd")'),
  }),
  outputSchema: z.object({
    coinId: z.string(),
    currentPrice: z.number(),
    priceDataPoints: z.number(),
    indicators: z.object({
      rsi: z.object({ value: z.number().nullable(), signal: z.string() }),
      sma20: z.object({ value: z.number().nullable(), signal: z.string() }),
      sma50: z.object({ value: z.number().nullable(), signal: z.string() }),
      sma200: z.object({ value: z.number().nullable(), signal: z.string() }),
      ema12: z.object({ value: z.number().nullable() }),
      ema26: z.object({ value: z.number().nullable() }),
      macd: z.object({
        macdLine: z.number().nullable(),
        signalLine: z.number().nullable(),
        histogram: z.number().nullable(),
        signal: z.string(),
      }),
      bollingerBands: z.object({
        upper: z.number().nullable(),
        middle: z.number().nullable(),
        lower: z.number().nullable(),
        bandwidth: z.number().nullable(),
        signal: z.string(),
      }),
    }),
    overallSignal: z.string(),
    signalScore: z.number(),
    signalSummary: z.string(),
    supportLevel: z.number().nullable(),
    resistanceLevel: z.number().nullable(),
  }),
  execute: async (inputData) => {
    const currency = inputData.currency || 'usd';
    const days = Math.max(30, inputData.days || 200);

    const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(inputData.coinId)}/market_chart?vs_currency=${currency}&days=${days}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { prices: [number, number][] };

    if (!data.prices || data.prices.length === 0) {
      throw new Error(`No historical price data found for ${inputData.coinId}`);
    }

    const closingPrices = data.prices.map(([, price]) => price);
    const currentPrice = closingPrices.at(-1);
    if (currentPrice === undefined) {
      throw new Error(`No price data available for ${inputData.coinId}`);
    }
    const recentPrices = closingPrices.slice(-30);

    const rsi = calculateRSI(closingPrices, 14);
    const sma20 = calculateSMA(closingPrices, 20);
    const sma50 = calculateSMA(closingPrices, 50);
    const sma200 = calculateSMA(closingPrices, 200);
    const ema12 = calculateEMA(closingPrices, 12);
    const ema26 = calculateEMA(closingPrices, 26);
    const macd = calculateMACD(closingPrices);
    const bollinger = calculateBollingerBands(closingPrices, 20, 2);

    const supportLevel = Math.min(...recentPrices);
    const resistanceLevel = Math.max(...recentPrices);

    const signalResult = generateOverallSignal(currentPrice, rsi, sma20, sma50, sma200, macd, bollinger);

    return {
      coinId: inputData.coinId,
      currentPrice,
      priceDataPoints: closingPrices.length,
      indicators: {
        rsi: buildRsiOutput(rsi),
        sma20: buildSmaOutput(sma20, currentPrice),
        sma50: buildSmaOutput(sma50, currentPrice),
        sma200: buildSmaOutput(sma200, currentPrice),
        ema12: { value: roundOrNull(ema12) },
        ema26: { value: roundOrNull(ema26) },
        macd: buildMacdOutput(macd),
        bollingerBands: buildBollingerOutput(bollinger, currentPrice),
      },
      overallSignal: signalResult.overallSignal,
      signalScore: signalResult.signalScore,
      signalSummary: signalResult.summary,
      supportLevel: roundOrNull(supportLevel),
      resistanceLevel: roundOrNull(resistanceLevel),
    };
  },
});
