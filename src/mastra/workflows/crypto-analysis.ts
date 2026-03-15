import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { saveReport, generateReportId } from '../reports/storage';
import { getActiveModelLabel } from '../reports/model-config';
import {
  calculateSMA, calculateEMA, calculateRSI,
  calculateMACD, calculateBollinger, calculateStochastic, calculateCCI,
  calculateOBV, calculateFibonacci, calculateATR, calculateADX,
  calculateIchimoku, calculateVWAP, roundOrNull,
  type OHLCCandle,
} from '../lib/indicators';
import {
  scoreRSI, scoreSMA, scoreMACD, scoreBollinger,
  scoreFearGreed, scoreMomentum, scoreSMACrossover, scoreVolumeProfile,
  scoreStochastic, scoreCCI, scoreOBV,
  scoreADX, scoreIchimoku, scoreVWAP,
  computeCompositeSignal,
  type IndicatorResult,
} from '../lib/scoring';

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
  // ── Existing indicators ──
  rsi: z.number().nullable(),
  sma20: z.number().nullable(),
  sma50: z.number().nullable(),
  sma200: z.number().nullable(),
  macdLine: z.number().nullable(),
  macdSignal: z.number().nullable(),
  macdHistogram: z.number().nullable(),
  bollingerUpper: z.number().nullable(),
  bollingerLower: z.number().nullable(),
  bollingerMiddle: z.number().nullable(),
  ema12: z.number().nullable(),
  ema26: z.number().nullable(),
  volumeRatio: z.number().nullable(),
  athChangePercentage: z.number().nullable(),
  // ── New Phase-1 indicators ──
  stochK: z.number().nullable(),
  stochD: z.number().nullable(),
  cci: z.number().nullable(),
  obvTrend: z.string().nullable(),
  fibHigh: z.number().nullable(),
  fibLow: z.number().nullable(),
  fibTrend: z.string().nullable(),
  fib236: z.number().nullable(),
  fib382: z.number().nullable(),
  fib500: z.number().nullable(),
  fib618: z.number().nullable(),
  fib786: z.number().nullable(),
  // ── Phase-2 OHLC indicators ──
  adx: z.number().nullable(),
  adxPlusDI: z.number().nullable(),
  adxMinusDI: z.number().nullable(),
  atr: z.number().nullable(),
  ichimokuTenkan: z.number().nullable(),
  ichimokuKijun: z.number().nullable(),
  ichimokuSenkouA: z.number().nullable(),
  ichimokuSenkouB: z.number().nullable(),
  ichimokuSignal: z.string().nullable(),
  ichimokuTkCross: z.string().nullable(),
  vwap: z.number().nullable(),
  // ── Phase-3 context ──
  btcDominance: z.number().nullable(),
  totalMarketCap: z.number().nullable(),
  marketCapChange24h: z.number().nullable(),
  // ── Scoring ──
  indicatorBreakdown: z.string(),
  supportLevel: z.number(),
  resistanceLevel: z.number(),
  fearGreedIndex: z.number(),
  fearGreedLabel: z.string(),
  overallSignal: z.string(),
  signalScore: z.number(),
  signalSummary: z.string(),
});

// ─── Step 1: Fetch Data + Compute TA ─────────────────────────────────

/** Builds the IndicatorResult[] array from all computed indicators + market context. */
function collectScoringResults(params: {
  currentPrice: number;
  rsi: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  macd: ReturnType<typeof calculateMACD>;
  bollinger: ReturnType<typeof calculateBollinger>;
  stoch: ReturnType<typeof calculateStochastic>;
  cci: number | null;
  obv: ReturnType<typeof calculateOBV>;
  adx: ReturnType<typeof calculateADX>;
  ichimoku: ReturnType<typeof calculateIchimoku>;
  vwap: number | null;
  fearGreedIndex: number;
  priceChangePercentage24h: number;
  volumeRatio: number | null;
}): IndicatorResult[] {
  const { currentPrice, rsi, sma20, sma50, sma200, macd, bollinger,
    stoch, cci, obv, adx, ichimoku, vwap,
    fearGreedIndex, priceChangePercentage24h, volumeRatio } = params;

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
  results.push(scoreFearGreed(fearGreedIndex), scoreMomentum(priceChangePercentage24h));
  if (sma50 !== null && sma200 !== null) results.push(scoreSMACrossover(sma50, sma200));
  if (volumeRatio !== null) results.push(scoreVolumeProfile(volumeRatio));
  return results;
}

const fetchAndAnalyze = createStep({
  id: 'fetch-and-analyze',
  description: 'Fetches current price, historical data, computes technical indicators, and market sentiment for a cryptocurrency',
  inputSchema: z.object({
    coinId: z.string().describe('CoinGecko coin ID (e.g., "bitcoin")'),
    modelLabel: z.string().optional().describe('Model used for this run'),
  }),
  outputSchema: coinDataSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data not found');

    // Fetch all data in parallel (OHLC for Phase-2, /global for Phase-3)
    const [marketRes, historyRes, ohlcRes, fgRes, globalRes] = await Promise.all([
      fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(inputData.coinId)}&sparkline=false`,
      ),
      fetch(
        `${COINGECKO_BASE}/coins/${encodeURIComponent(inputData.coinId)}/market_chart?vs_currency=usd&days=200`,
      ),
      fetch(
        `${COINGECKO_BASE}/coins/${encodeURIComponent(inputData.coinId)}/ohlc?vs_currency=usd&days=90`,
      ),
      fetch(`${FEAR_GREED_API}/?limit=1`),
      fetch(`${COINGECKO_BASE}/global`),
    ]);

    if (!marketRes.ok) throw new Error(`CoinGecko markets error: ${marketRes.status}`);
    if (!historyRes.ok) throw new Error(`CoinGecko history error: ${historyRes.status}`);

    const marketData = (await marketRes.json()) as any[];
    const historyData = (await historyRes.json()) as { prices: [number, number][]; total_volumes: [number, number][] };

    if (!marketData[0]) throw new Error(`Coin "${inputData.coinId}" not found`);

    const coin = marketData[0];
    const closingPrices = historyData.prices.map(([, p]: [number, number]) => p);
    const recentPrices = closingPrices.slice(-30);

    // Parse OHLC candles (CoinGecko returns [timestamp, open, high, low, close])
    let ohlcCandles: OHLCCandle[] = [];
    if (ohlcRes.ok) {
      const ohlcRaw = (await ohlcRes.json()) as [number, number, number, number, number][];
      ohlcCandles = ohlcRaw.map(([, o, h, l, c]) => ({ open: o, high: h, low: l, close: c }));
    }

    // Global market data (Phase-3: BTC Dominance)
    let btcDominance: number | null = null;
    let totalMarketCap: number | null = null;
    let marketCapChange24h: number | null = null;
    if (globalRes.ok) {
      const globalData = (await globalRes.json()) as {
        data: {
          total_market_cap: Record<string, number>;
          market_cap_percentage: Record<string, number>;
          market_cap_change_percentage_24h_usd: number;
        };
      };
      btcDominance = Number.parseFloat((globalData.data.market_cap_percentage['btc'] ?? 0).toFixed(2));
      totalMarketCap = globalData.data.total_market_cap['usd'] ?? null;
      marketCapChange24h = Number.parseFloat((globalData.data.market_cap_change_percentage_24h_usd ?? 0).toFixed(2));
    }

    // Volume analysis
    const volumes = historyData.total_volumes?.map(([, v]: [number, number]) => v) ?? [];
    const avgVolume30d = volumes.length >= 30
      ? volumes.slice(-30).reduce((s, v) => s + v, 0) / 30
      : null;
    const volumeRatio = avgVolume30d && coin.total_volume > 0
      ? Number.parseFloat((coin.total_volume / avgVolume30d).toFixed(2))
      : null;

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

    // Compute TA using shared library
    const rsi = calculateRSI(closingPrices);
    const sma20 = calculateSMA(closingPrices, 20);
    const sma50 = calculateSMA(closingPrices, 50);
    const sma200 = calculateSMA(closingPrices, 200);
    const macd = calculateMACD(closingPrices);
    const boll = calculateBollinger(closingPrices);
    const ema12 = calculateEMA(closingPrices, 12);
    const ema26 = calculateEMA(closingPrices, 26);

    // Phase-1 indicators (upgraded with OHLC when available)
    const hasOHLC = ohlcCandles.length > 0;
    const stoch = calculateStochastic(closingPrices, 14, 3, hasOHLC ? ohlcCandles : undefined);
    const cci = calculateCCI(closingPrices, 20, hasOHLC ? ohlcCandles : undefined);
    const obv = calculateOBV(closingPrices, volumes);
    const fib = calculateFibonacci(closingPrices);

    // Phase-2 OHLC indicators
    const adx = hasOHLC ? calculateADX(ohlcCandles) : null;
    const atr = hasOHLC ? calculateATR(ohlcCandles) : null;
    const ichimoku = hasOHLC ? calculateIchimoku(ohlcCandles) : null;
    const vwap = hasOHLC ? calculateVWAP(ohlcCandles, volumes.slice(-ohlcCandles.length)) : null;

    // Composite signal (all indicators + market context)
    const results = collectScoringResults({
      currentPrice: coin.current_price,
      rsi, sma20, sma50, sma200, macd, bollinger: boll,
      stoch, cci, obv, adx, ichimoku, vwap,
      fearGreedIndex: fgValue,
      priceChangePercentage24h: coin.price_change_percentage_24h || 0,
      volumeRatio,
    });
    const { overallSignal, signalScore, signalSummary, indicatorBreakdown } =
      computeCompositeSignal(results);

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
      rsi: roundOrNull(rsi),
      sma20: roundOrNull(sma20),
      sma50: roundOrNull(sma50),
      sma200: roundOrNull(sma200),
      macdLine: macd ? roundOrNull(macd.macdLine) : null,
      macdSignal: macd ? roundOrNull(macd.signalLine) : null,
      macdHistogram: macd ? roundOrNull(macd.histogram) : null,
      bollingerUpper: boll ? roundOrNull(boll.upper) : null,
      bollingerLower: boll ? roundOrNull(boll.lower) : null,
      bollingerMiddle: boll ? roundOrNull(boll.middle) : null,
      ema12: roundOrNull(ema12),
      ema26: roundOrNull(ema26),
      volumeRatio,
      athChangePercentage: coin.ath_change_percentage ?? null,
      // New Phase-1 fields
      stochK: stoch ? stoch.k : null,
      stochD: stoch ? stoch.d : null,
      cci: roundOrNull(cci),
      obvTrend: obv?.trend ?? null,
      fibHigh: fib ? roundOrNull(fib.high) : null,
      fibLow: fib ? roundOrNull(fib.low) : null,
      fibTrend: fib?.trend ?? null,
      fib236: fib ? roundOrNull(fib.level236) : null,
      fib382: fib ? roundOrNull(fib.level382) : null,
      fib500: fib ? roundOrNull(fib.level500) : null,
      fib618: fib ? roundOrNull(fib.level618) : null,
      fib786: fib ? roundOrNull(fib.level786) : null,
      // Phase-2
      adx: adx ? roundOrNull(adx.adx) : null,
      adxPlusDI: adx ? roundOrNull(adx.plusDI) : null,
      adxMinusDI: adx ? roundOrNull(adx.minusDI) : null,
      atr: atr ? roundOrNull(atr.atr) : null,
      ichimokuTenkan: ichimoku ? roundOrNull(ichimoku.tenkan) : null,
      ichimokuKijun: ichimoku ? roundOrNull(ichimoku.kijun) : null,
      ichimokuSenkouA: ichimoku ? roundOrNull(ichimoku.senkouA) : null,
      ichimokuSenkouB: ichimoku ? roundOrNull(ichimoku.senkouB) : null,
      ichimokuSignal: ichimoku?.signal ?? null,
      ichimokuTkCross: ichimoku?.tkCross ?? null,
      vwap: roundOrNull(vwap),
      // Phase-3
      btcDominance,
      totalMarketCap,
      marketCapChange24h,
      // Scoring
      indicatorBreakdown,
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
    rawData: z.string().describe('JSON-serialized raw coin data from the analysis step'),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Analysis data not found');

    const agent = mastra?.getAgent('cryptoSignalsAgent');
    if (!agent) throw new Error('Crypto signals agent not found');

    const prompt = `You are an aggressive crypto trading analyst. Analyze the following data and give CLEAR, DIRECT, and ACTIONABLE trading advice. Do NOT be vague or wishy-washy. Take a STRONG position. DO NOT call any tools — all data is provided below.

**${inputData.name} (${inputData.symbol})**

📊 MARKET DATA:
• Price: $${inputData.currentPrice} | 24h: ${inputData.priceChangePercentage24h > 0 ? '+' : ''}${inputData.priceChangePercentage24h.toFixed(2)}% ($${inputData.priceChange24h.toFixed(2)})
• 24h Range: $${inputData.low24h} — $${inputData.high24h}
• Market Cap: $${(inputData.marketCap / 1e9).toFixed(2)}B | Volume: $${(inputData.volume24h / 1e9).toFixed(2)}B
${inputData.volumeRatio !== null ? `• Volume Ratio (vs 30d avg): ${inputData.volumeRatio}x ${inputData.volumeRatio >= 1.5 ? '🔥 HIGH VOLUME' : inputData.volumeRatio <= 0.5 ? '⚠️ LOW VOLUME' : ''}` : ''}
${inputData.athChangePercentage !== null ? `• Distance from ATH: ${inputData.athChangePercentage.toFixed(1)}%` : ''}

📈 TECHNICAL INDICATORS:
• RSI (14): ${inputData.rsi ?? 'N/A'} ${inputData.rsi !== null ? (inputData.rsi < 30 ? '⚠️ OVERSOLD Zone' : inputData.rsi > 70 ? '⚠️ OVERBOUGHT Zone' : '') : ''}
• EMA 12: ${inputData.ema12 === null ? 'N/A' : '$' + inputData.ema12} | EMA 26: ${inputData.ema26 === null ? 'N/A' : '$' + inputData.ema26} ${inputData.ema12 !== null && inputData.ema26 !== null ? (inputData.ema12 > inputData.ema26 ? '🟢 Bullish Cross' : '🔴 Bearish Cross') : ''}
• SMA 20: ${inputData.sma20 === null ? 'N/A' : '$' + inputData.sma20} ${inputData.sma20 !== null ? (inputData.currentPrice > inputData.sma20 ? '🟢 Above' : '🔴 Below') : ''}
• SMA 50: ${inputData.sma50 === null ? 'N/A' : '$' + inputData.sma50} ${inputData.sma50 !== null ? (inputData.currentPrice > inputData.sma50 ? '🟢 Above' : '🔴 Below') : ''}
• SMA 200: ${inputData.sma200 === null ? 'N/A' : '$' + inputData.sma200} ${inputData.sma200 !== null ? (inputData.currentPrice > inputData.sma200 ? '🟢 Above' : '🔴 Below') : ''}
${inputData.sma50 !== null && inputData.sma200 !== null ? `• SMA Cross: ${inputData.sma50 > inputData.sma200 ? '🟢 GOLDEN CROSS (50 > 200) — Bullish' : '🔴 DEATH CROSS (50 < 200) — Bearish'}` : ''}
• MACD Histogram: ${inputData.macdHistogram ?? 'N/A'} ${inputData.macdHistogram !== null ? (inputData.macdHistogram > 0 ? '🟢 Bullish momentum' : '🔴 Bearish momentum') : ''}
• Bollinger: Upper $${inputData.bollingerUpper ?? 'N/A'} / Lower $${inputData.bollingerLower ?? 'N/A'}
• Support: $${inputData.supportLevel} | Resistance: $${inputData.resistanceLevel}
${inputData.adx !== null ? `• ADX (14): ${inputData.adx} ${inputData.adx >= 25 ? (inputData.adxPlusDI! > inputData.adxMinusDI! ? '🟢 Trending Bullish' : '🔴 Trending Bearish') : '➡️ No Clear Trend'} | +DI: ${inputData.adxPlusDI} | -DI: ${inputData.adxMinusDI}` : ''}
${inputData.atr !== null ? `• ATR (14): $${inputData.atr} (volatility measure)` : ''}
${inputData.ichimokuSignal !== null ? `• Ichimoku Cloud: ${inputData.ichimokuSignal} ${inputData.ichimokuSignal === 'ABOVE_CLOUD' ? '🟢' : inputData.ichimokuSignal === 'BELOW_CLOUD' ? '🔴' : '🟡'} | TK Cross: ${inputData.ichimokuTkCross} | Tenkan: $${inputData.ichimokuTenkan} | Kijun: $${inputData.ichimokuKijun}` : ''}
${inputData.vwap !== null ? `• VWAP: $${inputData.vwap} ${inputData.currentPrice > inputData.vwap ? '🟢 Price Above VWAP' : '🔴 Price Below VWAP'}` : ''}

🧠 SENTIMENT & MARKET CONTEXT:
• Fear & Greed: ${inputData.fearGreedIndex}/100 (${inputData.fearGreedLabel}) ${inputData.fearGreedIndex <= 25 ? '→ Contrarian BUY signal (extreme fear = opportunity)' : inputData.fearGreedIndex >= 75 ? '→ Contrarian SELL signal (extreme greed = caution)' : ''}
${inputData.btcDominance !== null ? `• BTC Dominance: ${inputData.btcDominance}% ${inputData.coinId !== 'bitcoin' ? (inputData.btcDominance >= 55 ? '⚠️ High BTC dominance — bearish for altcoins' : inputData.btcDominance <= 40 ? '🟢 Low BTC dominance — favorable for altcoins (alt-season signal)' : '') : ''}` : ''}
${inputData.totalMarketCap !== null ? `• Total Market Cap: $${(inputData.totalMarketCap / 1e12).toFixed(2)}T ${inputData.marketCapChange24h !== null ? `(24h: ${inputData.marketCapChange24h > 0 ? '+' : ''}${inputData.marketCapChange24h}%)` : ''}` : ''}

🎯 QUANTITATIVE SIGNAL (${inputData.signalScore >= 0 ? '+' : ''}${inputData.signalScore}/100):
• Signal: **${inputData.overallSignal}** | Score: **${inputData.signalScore}/100**
• Indicator Breakdown: ${inputData.indicatorBreakdown}
• Summary: ${inputData.signalSummary}

---

Generate a POWERFUL, DECISIVE analysis with these EXACT sections:

## 🎯 TRADING SIGNAL: [STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL]
State your verdict clearly and boldly. Do you agree with the quantitative signal (${inputData.overallSignal}, ${inputData.signalScore}/100)? If you disagree, explain why with specific indicator references. Confidence level (1-10).

## 📊 Technical Analysis Deep Dive
You MUST analyze ALL of the following indicators individually — do NOT skip any:

**Trend Indicators:**
- RSI (14): ${inputData.rsi ?? 'N/A'} — What zone? Divergence with price?
- SMA 20/50/200: Golden/Death Cross status, price position relative to each
- EMA 12/26: Cross direction and momentum implications
- MACD: Histogram direction, line crossover, momentum strength
${inputData.adx !== null ? `- ADX (14): ${inputData.adx} (+DI: ${inputData.adxPlusDI}, -DI: ${inputData.adxMinusDI}) — Is the market trending or ranging?` : ''}
${inputData.ichimokuSignal !== null ? `- Ichimoku Cloud: ${inputData.ichimokuSignal}, TK Cross: ${inputData.ichimokuTkCross} — Cloud support/resistance, future cloud direction` : ''}

**Momentum & Volatility:**
- Bollinger Bands: Price position within bands, bandwidth squeeze/expansion
- Stochastic (%K: ${inputData.stochK ?? 'N/A'}, %D: ${inputData.stochD ?? 'N/A'}): Overbought/oversold, %K/%D cross
- CCI (20): ${inputData.cci ?? 'N/A'} — Deviation from statistical mean
- OBV Trend: ${inputData.obvTrend ?? 'N/A'} — Volume confirming or diverging from price?
${inputData.atr !== null ? `- ATR (14): $${inputData.atr} — Current volatility level, implications for stop loss sizing` : ''}
${inputData.vwap !== null ? `- VWAP: $${inputData.vwap} — Institutional fair value, price deviation significance` : ''}

**Support & Resistance:**
- 30-day Support ($${inputData.supportLevel}) / Resistance ($${inputData.resistanceLevel})
${inputData.fibHigh !== null ? `- Fibonacci levels (${inputData.fibTrend} trend): 23.6% $${inputData.fib236}, 38.2% $${inputData.fib382}, 50% $${inputData.fib500}, 61.8% $${inputData.fib618}, 78.6% $${inputData.fib786} — Which level is acting as support/resistance NOW?` : ''}

**Sentiment & Context:**
- Fear & Greed: ${inputData.fearGreedIndex}/100 (${inputData.fearGreedLabel}) — Contrarian implications
- Volume Ratio: ${inputData.volumeRatio ?? 'N/A'}x vs 30d avg — Is volume confirming the move?
${inputData.btcDominance !== null ? `- BTC Dominance: ${inputData.btcDominance}% — Impact on this ${inputData.coinId !== 'bitcoin' ? 'altcoin' : 'asset'}` : ''}
${inputData.totalMarketCap !== null ? `- Total Market Cap: $${(inputData.totalMarketCap / 1e12).toFixed(2)}T (24h: ${inputData.marketCapChange24h ?? 0}%) — Overall market health` : ''}

What story are ALL indicators telling together? Are they aligned or diverging? What's the dominant narrative?

## 💰 Action Plan
- **Entry Zone**: Specific price range to enter (use Fibonacci + support/resistance + VWAP data)
- **Take Profit Target 1**: Conservative target with % gain (reference key Fibonacci/resistance levels)
- **Take Profit Target 2**: Aggressive target with % gain
- **Stop Loss**: Specific price level with % risk from entry (factor in ATR for volatility-adjusted stop)
- **Risk/Reward Ratio**: Calculate it clearly
- **Position Sizing**: Suggest conservative/moderate/aggressive based on conviction and ATR volatility

## ⏱️ Timeframe Outlook
- **Next 24-48 hours**: Immediate price action expectation
- **1 week outlook**: Short-term direction and key levels to watch
- **1 month outlook**: Medium-term trend assessment

## ⚠️ Key Risks
List the top 3 specific risks for this trade RIGHT NOW. What would invalidate this signal?

## � Whale & Smart Money Analysis
Based on the data above, analyze how whales (large institutional holders) and bulls (smart money) are likely positioning RIGHT NOW. Use these specific data points as evidence:

- **OBV Trend (${inputData.obvTrend ?? 'N/A'})**: Is the On-Balance Volume suggesting large-scale accumulation (whales buying quietly while price is flat) or distribution (whales selling into strength)?
- **Volume Ratio (${inputData.volumeRatio ?? 'N/A'}x)**: Unusual volume (>1.5x) often signals institutional activity. Is smart money entering or exiting?
- **Fear & Greed (${inputData.fearGreedIndex}/100 — ${inputData.fearGreedLabel})**: Whales historically accumulate during Extreme Fear and distribute during Extreme Greed. What phase are we in?
${inputData.btcDominance !== null ? `- **BTC Dominance (${inputData.btcDominance}%)**: Are institutions rotating from altcoins to BTC (risk-off) or from BTC to alts (risk-on)?` : ''}
${inputData.vwap !== null ? `- **Price vs VWAP ($${inputData.vwap})**: Institutions use VWAP as fair value. Price ${inputData.currentPrice > inputData.vwap ? 'above' : 'below'} VWAP suggests whales see the current price as ${inputData.currentPrice > inputData.vwap ? 'expensive (may sell)' : 'cheap (may accumulate)'}.` : ''}
${inputData.adx !== null ? `- **ADX (${inputData.adx}) + Volume**: High ADX with high volume = whales pushing the trend. Low ADX = accumulation/distribution range.` : ''}
- **Support ($${inputData.supportLevel}) & Resistance ($${inputData.resistanceLevel})**: Whales place large buy/sell walls at key levels. Are we approaching a whale wall?

Conclude with: What is the **most likely whale play** right now? Accumulation, distribution, or holding? What should retail traders do based on smart money behavior?

## �💡 Pro Tip
One unique, actionable insight that most traders would miss about this coin right now.

Be SPECIFIC with numbers. No vague language. Take a clear directional position.

⚠️ *Disclaimer: This is AI-generated analysis based on technical indicators and market data. It is NOT financial advice. Always do your own research (DYOR) and never invest more than you can afford to lose. Crypto markets are highly volatile.*`;

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

    return { report: trimmed, rawData: JSON.stringify(inputData) };
  },
});

// ─── Step 3: Save HTML Report ────────────────────────────────────────

const saveHtmlReport = createStep({
  id: 'save-html-report',
  description: 'Persists the analysis report so it can be viewed via the /reports HTTP dashboard',
  inputSchema: z.object({
    report: z.string(),
    rawData: z.string().optional().describe('JSON-serialized raw coin data'),
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
      modelLabel: getActiveModelLabel(),
      rawData: inputData.rawData,
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
    modelLabel: z.string().optional().describe('Model used for this run'),
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
