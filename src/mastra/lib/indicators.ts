// ─── Technical Indicator Calculations ─────────────────────────────────
// Pure functions — no side effects, no API calls.
// Shared by both the `getTechnicalAnalysis` tool and the `crypto-analysis` workflow.

// ─── Types ───────────────────────────────────────────────────────────

/** Single OHLC candle from CoinGecko /ohlc endpoint. */
export interface OHLCCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function roundOrNull(val: number | null): number | null {
  return val === null ? null : Number.parseFloat(val.toFixed(2));
}

// ─── Moving Averages ─────────────────────────────────────────────────

/** Simple Moving Average — last `period` values. */
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((s, p) => s + p, 0) / period;
}

/** Exponential Moving Average — returns final value only. */
export function calculateEMA(prices: number[], period: number): number | null {
  const arr = calculateEMAArray(prices, period);
  return arr ? arr.at(-1) ?? null : null;
}

/** EMA as a full array (needed by MACD, OBV smoothing, etc.). */
export function calculateEMAArray(prices: number[], period: number): number[] | null {
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

// ─── Momentum / Oscillators ──────────────────────────────────────────

/** Relative Strength Index (Wilder smoothing). */
export function calculateRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;

  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const gain = Math.max(0, changes[i]);
    const loss = Math.max(0, -changes[i]);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

/** MACD (12, 26, 9). Returns line, signal, and histogram. */
export function calculateMACD(prices: number[]): MACDResult | null {
  if (prices.length < 35) return null;

  const ema12 = calculateEMAArray(prices, 12);
  const ema26 = calculateEMAArray(prices, 26);
  if (!ema12 || !ema26) return null;

  const macdArr: number[] = [];
  const offset = 25; // ema26 starts at index 25
  for (let i = offset; i < prices.length; i++) {
    const i12 = i - (prices.length - ema12.length);
    const i26 = i - offset;
    if (i12 >= 0 && i26 >= 0 && i12 < ema12.length && i26 < ema26.length) {
      macdArr.push(ema12[i12] - ema26[i26]);
    }
  }
  if (macdArr.length < 9) return null;

  // Signal line = EMA(9) of MACD array
  const sigArr = calculateEMAArray(macdArr, 9);
  if (!sigArr || sigArr.length === 0) return null;

  const macdLine = macdArr.at(-1);
  const signalLine = sigArr.at(-1);
  if (macdLine === undefined || signalLine === undefined) return null;

  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

/**
 * Stochastic Oscillator.
 * When OHLC candles are provided, uses real High/Low for accuracy.
 * Falls back to close-only when candles are not available.
 */
export function calculateStochastic(
  prices: number[],
  kPeriod = 14,
  dPeriod = 3,
  candles?: OHLCCandle[],
): { k: number; d: number } | null {
  const useOHLC = candles && candles.length >= kPeriod + dPeriod - 1;
  const len = useOHLC ? candles!.length : prices.length;
  if (len < kPeriod + dPeriod - 1) return null;

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < len; i++) {
    let low: number, high: number, close: number;
    if (useOHLC) {
      const window = candles!.slice(i - kPeriod + 1, i + 1);
      low = Math.min(...window.map(c => c.low));
      high = Math.max(...window.map(c => c.high));
      close = candles![i].close;
    } else {
      const window = prices.slice(i - kPeriod + 1, i + 1);
      low = Math.min(...window);
      high = Math.max(...window);
      close = prices[i];
    }
    const range = high - low;
    kValues.push(range === 0 ? 50 : ((close - low) / range) * 100);
  }

  if (kValues.length < dPeriod) return null;
  const d = kValues.slice(-dPeriod).reduce((s, v) => s + v, 0) / dPeriod;
  const k = kValues.at(-1)!;

  return { k: Number.parseFloat(k.toFixed(2)), d: Number.parseFloat(d.toFixed(2)) };
}

/**
 * Commodity Channel Index.
 * Uses Typical Price (H+L+C)/3 when OHLC candles are provided,
 * otherwise falls back to close-only approximation.
 */
export function calculateCCI(
  prices: number[],
  period = 20,
  candles?: OHLCCandle[],
): number | null {
  const useOHLC = candles && candles.length >= period;
  if (useOHLC) {
    const slice = candles!.slice(-period);
    const tps = slice.map(c => (c.high + c.low + c.close) / 3);
    const mean = tps.reduce((s, v) => s + v, 0) / period;
    const mad = tps.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
    if (mad === 0) return 0;
    return (tps.at(-1)! - mean) / (0.015 * mad);
  }

  if (prices.length < period) return null;
  const window = prices.slice(-period);
  const mean = window.reduce((s, p) => s + p, 0) / period;
  const meanDeviation = window.reduce((s, p) => s + Math.abs(p - mean), 0) / period;
  if (meanDeviation === 0) return 0;
  return (prices.at(-1)! - mean) / (0.015 * meanDeviation);
}

// ─── Volume-Based ────────────────────────────────────────────────────

export interface OBVResult {
  obv: number;
  obvSma20: number | null;
  trend: 'RISING' | 'FALLING' | 'FLAT';
}

/**
 * On-Balance Volume.
 * Returns latest OBV, its 20-period SMA, and trend direction.
 */
export function calculateOBV(
  prices: number[],
  volumes: number[],
): OBVResult | null {
  const len = Math.min(prices.length, volumes.length);
  if (len < 21) return null; // need enough for OBV + SMA(20)

  const obvArr: number[] = [0];
  for (let i = 1; i < len; i++) {
    const prev = obvArr[i - 1];
    if (prices[i] > prices[i - 1]) obvArr.push(prev + volumes[i]);
    else if (prices[i] < prices[i - 1]) obvArr.push(prev - volumes[i]);
    else obvArr.push(prev);
  }

  const obv = obvArr.at(-1)!;
  const obvSma20 = obvArr.length >= 20
    ? obvArr.slice(-20).reduce((s, v) => s + v, 0) / 20
    : null;

  // Trend: compare last 5 OBV values
  const recent = obvArr.slice(-5);
  const older = obvArr.slice(-10, -5);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const olderAvg = older.length > 0
    ? older.reduce((s, v) => s + v, 0) / older.length
    : recentAvg;

  const diff = ((recentAvg - olderAvg) / (Math.abs(olderAvg) || 1)) * 100;
  const trend: OBVResult['trend'] = diff > 2 ? 'RISING' : diff < -2 ? 'FALLING' : 'FLAT';

  return { obv, obvSma20, trend };
}

// ─── Volatility / Bands ──────────────────────────────────────────────

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

/** Bollinger Bands (default period 20, 2 std devs). */
export function calculateBollinger(
  prices: number[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerResult | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const middle = slice.reduce((s, p) => s + p, 0) / period;
  const std = Math.sqrt(slice.reduce((s, p) => s + (p - middle) ** 2, 0) / period);
  const upper = middle + stdDevMultiplier * std;
  const lower = middle - stdDevMultiplier * std;
  return { upper, middle, lower, bandwidth: middle !== 0 ? ((upper - lower) / middle) * 100 : 0 };
}

// ─── Support / Resistance ────────────────────────────────────────────

export interface FibonacciLevels {
  high: number;
  low: number;
  level236: number;
  level382: number;
  level500: number;
  level618: number;
  level786: number;
  trend: 'UP' | 'DOWN';
}

/**
 * Fibonacci Retracement levels based on the swing high/low of the price array.
 * `trend` indicates the dominant direction: UP means retrace from high,
 * DOWN means retrace from low.
 */
export function calculateFibonacci(prices: number[]): FibonacciLevels | null {
  if (prices.length < 30) return null;

  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const range = high - low;
  if (range === 0) return null;

  // Determine trend: if the high is more recent than the low → uptrend
  const highIdx = prices.lastIndexOf(high);
  const lowIdx = prices.lastIndexOf(low);
  const trend: 'UP' | 'DOWN' = highIdx > lowIdx ? 'UP' : 'DOWN';

  // In an uptrend, retracement levels are below the high.
  // In a downtrend, extension levels are above the low.
  if (trend === 'UP') {
    return {
      high, low, trend,
      level236: high - range * 0.236,
      level382: high - range * 0.382,
      level500: high - range * 0.500,
      level618: high - range * 0.618,
      level786: high - range * 0.786,
    };
  }
  return {
    high, low, trend,
    level236: low + range * 0.236,
    level382: low + range * 0.382,
    level500: low + range * 0.500,
    level618: low + range * 0.618,
    level786: low + range * 0.786,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 2: OHLC-based indicators
// ═══════════════════════════════════════════════════════════════════════

// ─── ATR (Average True Range) ────────────────────────────────────────

export interface ATRResult {
  atr: number;
  /** Current true range (latest candle). */
  currentTR: number;
}

/** Average True Range — requires OHLC candles. Default period 14. */
export function calculateATR(candles: OHLCCandle[], period = 14): ATRResult | null {
  if (candles.length < period + 1) return null;

  const trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trValues.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  // Wilder smoothing for ATR
  let atr = trValues.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  return { atr, currentTR: trValues.at(-1)! };
}

// ─── ADX (Average Directional Index) ─────────────────────────────────

export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
}

/** ADX — measures trend strength (not direction). Requires OHLC. Default period 14. */
export function calculateADX(candles: OHLCCandle[], period = 14): ADXResult | null {
  if (candles.length < period * 2 + 1) return null;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  // Wilder smoothing
  const smooth = (arr: number[]): number[] => {
    const out: number[] = [];
    let val = arr.slice(0, period).reduce((s, v) => s + v, 0);
    out.push(val);
    for (let i = period; i < arr.length; i++) {
      val = val - val / period + arr[i];
      out.push(val);
    }
    return out;
  };

  const smoothTR = smooth(tr);
  const smoothPlusDM = smooth(plusDM);
  const smoothMinusDM = smooth(minusDM);

  // DI values
  const dx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0) { dx.push(0); continue; }
    const pdi = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const mdi = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }

  if (dx.length < period) return null;

  // ADX = Wilder-smoothed DX
  let adx = dx.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }

  const lastTR = smoothTR.at(-1)!;
  const plusDI = lastTR === 0 ? 0 : (smoothPlusDM.at(-1)! / lastTR) * 100;
  const minusDI = lastTR === 0 ? 0 : (smoothMinusDM.at(-1)! / lastTR) * 100;

  return {
    adx: Number.parseFloat(adx.toFixed(2)),
    plusDI: Number.parseFloat(plusDI.toFixed(2)),
    minusDI: Number.parseFloat(minusDI.toFixed(2)),
  };
}

// ─── Ichimoku Cloud ──────────────────────────────────────────────────

export interface IchimokuResult {
  tenkan: number;   // Conversion Line (9)
  kijun: number;    // Base Line (26)
  senkouA: number;  // Leading Span A (shifted 26 ahead — current value)
  senkouB: number;  // Leading Span B (shifted 26 ahead — current value)
  chikou: number;   // Lagging Span (close shifted 26 back)
  cloudTop: number;
  cloudBottom: number;
  signal: 'ABOVE_CLOUD' | 'IN_CLOUD' | 'BELOW_CLOUD';
  tkCross: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/** Ichimoku Cloud — requires OHLC candles (minimum 52 periods). */
export function calculateIchimoku(candles: OHLCCandle[]): IchimokuResult | null {
  if (candles.length < 52) return null;

  const midpoint = (slice: OHLCCandle[]) => {
    const h = Math.max(...slice.map(c => c.high));
    const l = Math.min(...slice.map(c => c.low));
    return (h + l) / 2;
  };

  const tenkan = midpoint(candles.slice(-9));          // Conversion Line
  const kijun = midpoint(candles.slice(-26));           // Base Line
  const senkouA = (tenkan + kijun) / 2;                // Leading Span A
  const senkouB = midpoint(candles.slice(-52));         // Leading Span B
  const chikou = candles.at(-1)!.close;                 // Lagging Span (current close)

  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  const currentPrice = candles.at(-1)!.close;

  let signal: IchimokuResult['signal'];
  if (currentPrice > cloudTop) signal = 'ABOVE_CLOUD';
  else if (currentPrice < cloudBottom) signal = 'BELOW_CLOUD';
  else signal = 'IN_CLOUD';

  let tkCross: IchimokuResult['tkCross'] = 'NEUTRAL';
  if (tenkan > kijun) tkCross = 'BULLISH';
  else if (tenkan < kijun) tkCross = 'BEARISH';

  return {
    tenkan: Number.parseFloat(tenkan.toFixed(2)),
    kijun: Number.parseFloat(kijun.toFixed(2)),
    senkouA: Number.parseFloat(senkouA.toFixed(2)),
    senkouB: Number.parseFloat(senkouB.toFixed(2)),
    chikou: Number.parseFloat(chikou.toFixed(2)),
    cloudTop: Number.parseFloat(cloudTop.toFixed(2)),
    cloudBottom: Number.parseFloat(cloudBottom.toFixed(2)),
    signal,
    tkCross,
  };
}

// ─── VWAP (Volume-Weighted Average Price) ────────────────────────────

/**
 * Approximate daily VWAP using OHLC candles + volumes.
 * VWAP = Σ(TP × Vol) / Σ(Vol) where TP = (H+L+C)/3.
 * Uses last `period` candles.
 */
export function calculateVWAP(
  candles: OHLCCandle[],
  volumes: number[],
  period = 30,
): number | null {
  const len = Math.min(candles.length, volumes.length);
  if (len < period) return null;

  const slice = candles.slice(-period);
  const vols = volumes.slice(-period);

  let sumTPV = 0;
  let sumV = 0;
  for (let i = 0; i < period; i++) {
    const tp = (slice[i].high + slice[i].low + slice[i].close) / 3;
    sumTPV += tp * vols[i];
    sumV += vols[i];
  }

  return sumV === 0 ? null : sumTPV / sumV;
}
