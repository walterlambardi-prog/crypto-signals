// ─── Technical Analysis Tool ─────────────────────────────────────────
// Mastra tool that agents can call directly.  All calculations are
// delegated to the shared `lib/indicators` and `lib/scoring` modules.

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  calculateSMA, calculateEMA, calculateRSI, calculateMACD,
  calculateBollinger, calculateStochastic, calculateCCI,
  calculateOBV, calculateFibonacci, calculateATR, calculateADX,
  calculateIchimoku, calculateVWAP, roundOrNull,
  type OHLCCandle,
} from '../lib/indicators';
import {
  scoreRSI, scoreSMA, scoreMACD, scoreBollinger,
  scoreStochastic, scoreCCI, scoreOBV,
  scoreADX, scoreIchimoku, scoreVWAP,
  computeCompositeSignal,
  type IndicatorResult,
} from '../lib/scoring';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// ─── Tool Definition ─────────────────────────────────────────────────

export const getTechnicalAnalysis = createTool({
  id: 'get-technical-analysis',
  description:
    'Perform comprehensive technical analysis on a cryptocurrency. Fetches historical prices and OHLC data, computes RSI, SMA, EMA, MACD, Bollinger Bands, Stochastic, CCI, OBV, Fibonacci, ADX, ATR, Ichimoku Cloud, VWAP, and generates a trading signal.',
  inputSchema: z.object({
    coinId: z.string().describe('CoinGecko coin ID (e.g., "bitcoin", "ethereum", "solana")'),
    days: z.number().optional().describe('Number of days of historical data (default: 200, min: 30)'),
    currency: z.string().optional().describe('Target currency (default: "usd")'),
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
        upper: z.number().nullable(), middle: z.number().nullable(),
        lower: z.number().nullable(), bandwidth: z.number().nullable(),
        signal: z.string(),
      }),
      stochastic: z.object({ k: z.number().nullable(), d: z.number().nullable(), signal: z.string() }),
      cci: z.object({ value: z.number().nullable(), signal: z.string() }),
      obv: z.object({ value: z.number().nullable(), trend: z.string(), signal: z.string() }),
      adx: z.object({ adx: z.number().nullable(), plusDI: z.number().nullable(), minusDI: z.number().nullable(), signal: z.string() }),
      atr: z.object({ value: z.number().nullable() }),
      ichimoku: z.object({
        tenkan: z.number().nullable(), kijun: z.number().nullable(),
        senkouA: z.number().nullable(), senkouB: z.number().nullable(),
        cloudSignal: z.string(), tkCross: z.string(),
      }),
      vwap: z.object({ value: z.number().nullable(), signal: z.string() }),
    }),
    fibonacci: z.object({
      high: z.number(), low: z.number(), trend: z.string(),
      level236: z.number(), level382: z.number(), level500: z.number(),
      level618: z.number(), level786: z.number(),
    }).nullable(),
    overallSignal: z.string(),
    signalScore: z.number(),
    signalSummary: z.string(),
    supportLevel: z.number().nullable(),
    resistanceLevel: z.number().nullable(),
  }),
  execute: async (input) => {
    const currency = input.currency || 'usd';
    const days = Math.max(30, input.days || 200);

    const [histRes, ohlcRes] = await Promise.all([
      fetch(`${COINGECKO_BASE}/coins/${encodeURIComponent(input.coinId)}/market_chart?vs_currency=${currency}&days=${days}`),
      fetch(`${COINGECKO_BASE}/coins/${encodeURIComponent(input.coinId)}/ohlc?vs_currency=${currency}&days=90`),
    ]);
    if (!histRes.ok) throw new Error(`CoinGecko API error: ${histRes.status}`);

    const data = (await histRes.json()) as {
      prices: [number, number][];
      total_volumes: [number, number][];
    };
    if (!data.prices?.length) throw new Error(`No price data for ${input.coinId}`);

    // Parse OHLC candles
    let ohlcCandles: OHLCCandle[] = [];
    if (ohlcRes.ok) {
      const ohlcRaw = (await ohlcRes.json()) as [number, number, number, number, number][];
      ohlcCandles = ohlcRaw.map(([, o, h, l, c]) => ({ open: o, high: h, low: l, close: c }));
    }

    const closingPrices = data.prices.map(([, p]) => p);
    const volumes = data.total_volumes?.map(([, v]) => v) ?? [];
    const currentPrice = closingPrices.at(-1)!;
    const recentPrices = closingPrices.slice(-30);

    // ── Calculate all indicators ──
    const rsi = calculateRSI(closingPrices);
    const sma20 = calculateSMA(closingPrices, 20);
    const sma50 = calculateSMA(closingPrices, 50);
    const sma200 = calculateSMA(closingPrices, 200);
    const ema12 = calculateEMA(closingPrices, 12);
    const ema26 = calculateEMA(closingPrices, 26);
    const macd = calculateMACD(closingPrices);
    const bollinger = calculateBollinger(closingPrices);
    const hasOHLC = ohlcCandles.length > 0;
    const stoch = calculateStochastic(closingPrices, 14, 3, hasOHLC ? ohlcCandles : undefined);
    const cci = calculateCCI(closingPrices, 20, hasOHLC ? ohlcCandles : undefined);
    const obv = calculateOBV(closingPrices, volumes);
    const fib = calculateFibonacci(closingPrices);
    const adx = hasOHLC ? calculateADX(ohlcCandles) : null;
    const atr = hasOHLC ? calculateATR(ohlcCandles) : null;
    const ichimoku = hasOHLC ? calculateIchimoku(ohlcCandles) : null;
    const vwap = hasOHLC ? calculateVWAP(ohlcCandles, volumes.slice(-ohlcCandles.length)) : null;

    // ── Score ──
    const results: IndicatorResult[] = [];
    if (rsi !== null) results.push(scoreRSI(rsi));
    if (sma20 !== null) results.push(scoreSMA('SMA (20)', currentPrice, sma20, 1));
    if (sma50 !== null) results.push(scoreSMA('SMA (50)', currentPrice, sma50, 1.5));
    if (sma200 !== null) results.push(scoreSMA('SMA (200)', currentPrice, sma200, 2));
    if (macd) results.push(scoreMACD(macd));
    if (bollinger) results.push(scoreBollinger(currentPrice, bollinger));
    if (stoch) results.push(scoreStochastic(stoch.k, stoch.d));
    if (cci !== null) results.push(scoreCCI(cci));
    if (obv) results.push(scoreOBV(obv));
    if (adx) results.push(scoreADX(adx));
    if (ichimoku) results.push(scoreIchimoku(ichimoku));
    if (vwap !== null) results.push(scoreVWAP(currentPrice, vwap));

    const composite = computeCompositeSignal(results);

    // ── Build output ──
    const bollingerBandWidth = bollinger ? bollinger.upper - bollinger.lower : 0;
    const rsiSignal = rsi === null ? 'N/A' : rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL';
    const bollingerSignal = bollinger === null ? 'N/A'
      : currentPrice <= bollinger.lower + bollingerBandWidth * 0.1 ? 'OVERSOLD'
      : currentPrice >= bollinger.upper - bollingerBandWidth * 0.1 ? 'OVERBOUGHT' : 'NEUTRAL';

    return {
      coinId: input.coinId,
      currentPrice,
      priceDataPoints: closingPrices.length,
      indicators: {
        rsi: { value: roundOrNull(rsi), signal: rsiSignal },
        sma20: { value: roundOrNull(sma20), signal: sma20 === null ? 'N/A' : currentPrice > sma20 ? 'BULLISH' : 'BEARISH' },
        sma50: { value: roundOrNull(sma50), signal: sma50 === null ? 'N/A' : currentPrice > sma50 ? 'BULLISH' : 'BEARISH' },
        sma200: { value: roundOrNull(sma200), signal: sma200 === null ? 'N/A' : currentPrice > sma200 ? 'BULLISH' : 'BEARISH' },
        ema12: { value: roundOrNull(ema12) },
        ema26: { value: roundOrNull(ema26) },
        macd: {
          macdLine: macd ? roundOrNull(macd.macdLine) : null,
          signalLine: macd ? roundOrNull(macd.signalLine) : null,
          histogram: macd ? roundOrNull(macd.histogram) : null,
          signal: macd === null ? 'N/A' : macd.histogram > 0 ? 'BULLISH' : 'BEARISH',
        },
        bollingerBands: {
          upper: bollinger ? roundOrNull(bollinger.upper) : null,
          middle: bollinger ? roundOrNull(bollinger.middle) : null,
          lower: bollinger ? roundOrNull(bollinger.lower) : null,
          bandwidth: bollinger ? roundOrNull(bollinger.bandwidth) : null,
          signal: bollingerSignal,
        },
        stochastic: {
          k: stoch ? stoch.k : null, d: stoch ? stoch.d : null,
          signal: stoch === null ? 'N/A' : stoch.k < 20 ? 'OVERSOLD' : stoch.k > 80 ? 'OVERBOUGHT' : 'NEUTRAL',
        },
        cci: {
          value: roundOrNull(cci),
          signal: cci === null ? 'N/A' : cci < -100 ? 'OVERSOLD' : cci > 100 ? 'OVERBOUGHT' : 'NEUTRAL',
        },
        obv: {
          value: obv ? Math.round(obv.obv) : null,
          trend: obv?.trend ?? 'N/A',
          signal: obv === null ? 'N/A' : obv.trend === 'RISING' ? 'BULLISH' : obv.trend === 'FALLING' ? 'BEARISH' : 'NEUTRAL',
        },
        adx: {
          adx: adx ? roundOrNull(adx.adx) : null,
          plusDI: adx ? roundOrNull(adx.plusDI) : null,
          minusDI: adx ? roundOrNull(adx.minusDI) : null,
          signal: adx === null ? 'N/A' : adx.adx >= 25 ? (adx.plusDI > adx.minusDI ? 'BULLISH TREND' : 'BEARISH TREND') : 'NO TREND',
        },
        atr: { value: atr ? roundOrNull(atr.atr) : null },
        ichimoku: {
          tenkan: ichimoku ? roundOrNull(ichimoku.tenkan) : null,
          kijun: ichimoku ? roundOrNull(ichimoku.kijun) : null,
          senkouA: ichimoku ? roundOrNull(ichimoku.senkouA) : null,
          senkouB: ichimoku ? roundOrNull(ichimoku.senkouB) : null,
          cloudSignal: ichimoku?.signal ?? 'N/A',
          tkCross: ichimoku?.tkCross ?? 'N/A',
        },
        vwap: {
          value: roundOrNull(vwap),
          signal: vwap === null ? 'N/A' : currentPrice > vwap ? 'BULLISH' : 'BEARISH',
        },
      },
      fibonacci: fib ? {
        high: roundOrNull(fib.high)!, low: roundOrNull(fib.low)!, trend: fib.trend,
        level236: roundOrNull(fib.level236)!, level382: roundOrNull(fib.level382)!,
        level500: roundOrNull(fib.level500)!, level618: roundOrNull(fib.level618)!,
        level786: roundOrNull(fib.level786)!,
      } : null,
      overallSignal: composite.overallSignal,
      signalScore: composite.signalScore,
      signalSummary: composite.signalSummary,
      supportLevel: roundOrNull(Math.min(...recentPrices)),
      resistanceLevel: roundOrNull(Math.max(...recentPrices)),
    };
  },
});

