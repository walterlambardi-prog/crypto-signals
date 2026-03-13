// ─── Signal Scoring ───────────────────────────────────────────────────
// Pure scoring functions that convert indicator values into directional
// signals with weighted scores.  Used by both the tool and the workflow.

import type { MACDResult, BollingerResult, OBVResult, ADXResult, IchimokuResult } from './indicators';

// ─── Types ───────────────────────────────────────────────────────────

export type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface IndicatorResult {
  name: string;
  signal: SignalDirection;
  score: number;   // –100 … +100
  weight: number;   // importance multiplier
}

// ─── Individual Scorers ──────────────────────────────────────────────

export function scoreRSI(rsi: number): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (rsi < 20)       { signal = 'BULLISH'; score = 100; }
  else if (rsi < 30)  { signal = 'BULLISH'; score = 60;  }
  else if (rsi > 80)  { signal = 'BEARISH'; score = -100; }
  else if (rsi > 70)  { signal = 'BEARISH'; score = -60;  }
  else if (rsi < 45)  { score = 20;  }
  else if (rsi > 55)  { score = -20; }

  return { name: 'RSI (14)', signal, score, weight: 2 };
}

export function scoreSMA(
  name: string,
  currentPrice: number,
  sma: number,
  weight: number,
): IndicatorResult {
  const isBullish = currentPrice > sma;
  const magnitude = weight >= 2 ? 70 : weight >= 1.5 ? 50 : 30;
  return {
    name,
    signal: isBullish ? 'BULLISH' : 'BEARISH',
    score: isBullish ? magnitude : -magnitude,
    weight,
  };
}

export function scoreMACD(macd: MACDResult): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (macd.histogram > 0 && macd.macdLine > macd.signalLine) {
    signal = 'BULLISH'; score = 60;
  } else if (macd.histogram < 0 && macd.macdLine < macd.signalLine) {
    signal = 'BEARISH'; score = -60;
  } else if (macd.histogram > 0) {
    signal = 'BULLISH'; score = 30;
  } else if (macd.histogram < 0) {
    signal = 'BEARISH'; score = -30;
  }

  return { name: 'MACD', signal, score, weight: 2 };
}

export function scoreBollinger(
  currentPrice: number,
  bollinger: BollingerResult,
): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;
  const bandWidth = bollinger.upper - bollinger.lower;

  if (currentPrice <= bollinger.lower + bandWidth * 0.1) {
    signal = 'BULLISH'; score = 50;
  } else if (currentPrice >= bollinger.upper - bandWidth * 0.1) {
    signal = 'BEARISH'; score = -50;
  }

  return { name: 'Bollinger Bands', signal, score, weight: 1.5 };
}

export function scoreFearGreed(fgIndex: number): IndicatorResult {
  // Contrarian: extreme fear = buying opportunity (Buffett principle)
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (fgIndex <= 15)      { signal = 'BULLISH'; score = 70;  }
  else if (fgIndex <= 25) { signal = 'BULLISH'; score = 45;  }
  else if (fgIndex <= 35) { signal = 'BULLISH'; score = 20;  }
  else if (fgIndex >= 85) { signal = 'BEARISH'; score = -70; }
  else if (fgIndex >= 75) { signal = 'BEARISH'; score = -45; }
  else if (fgIndex >= 65) { signal = 'BEARISH'; score = -20; }

  return { name: 'Fear & Greed (Contrarian)', signal, score, weight: 1.5 };
}

export function scoreMomentum(priceChangePct24h: number): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (priceChangePct24h >= 8)       { signal = 'BULLISH'; score = 55;  }
  else if (priceChangePct24h >= 4)  { signal = 'BULLISH'; score = 35;  }
  else if (priceChangePct24h >= 1.5){ signal = 'BULLISH'; score = 15;  }
  else if (priceChangePct24h <= -8) { signal = 'BEARISH'; score = -55; }
  else if (priceChangePct24h <= -4) { signal = 'BEARISH'; score = -35; }
  else if (priceChangePct24h <= -1.5){ signal = 'BEARISH'; score = -15; }

  return { name: 'Momentum (24h)', signal, score, weight: 1.5 };
}

export function scoreSMACrossover(sma50: number, sma200: number): IndicatorResult {
  const isBullish = sma50 > sma200;
  const diff = Math.abs((sma50 - sma200) / sma200) * 100;
  const magnitude = diff > 5 ? 60 : diff > 2 ? 40 : 25;
  return {
    name: 'SMA Cross (50/200)',
    signal: isBullish ? 'BULLISH' : 'BEARISH',
    score: isBullish ? magnitude : -magnitude,
    weight: 2,
  };
}

export function scoreVolumeProfile(volumeRatio: number): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (volumeRatio >= 2)       { signal = 'BULLISH'; score = 35;  }
  else if (volumeRatio >= 1.3){ signal = 'BULLISH'; score = 15;  }
  else if (volumeRatio <= 0.4){ signal = 'BEARISH'; score = -20; }
  else if (volumeRatio <= 0.6){ signal = 'BEARISH'; score = -10; }

  return { name: 'Volume Profile', signal, score, weight: 1 };
}

// ─── New Phase-1 Scorers ─────────────────────────────────────────────

/** OBV: bullish when OBV is above its SMA-20 and trend is rising. */
export function scoreOBV(obv: OBVResult): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (obv.trend === 'RISING' && obv.obvSma20 !== null && obv.obv > obv.obvSma20) {
    signal = 'BULLISH'; score = 40;
  } else if (obv.trend === 'FALLING' && obv.obvSma20 !== null && obv.obv < obv.obvSma20) {
    signal = 'BEARISH'; score = -40;
  } else if (obv.trend === 'RISING') {
    signal = 'BULLISH'; score = 20;
  } else if (obv.trend === 'FALLING') {
    signal = 'BEARISH'; score = -20;
  }

  return { name: 'OBV', signal, score, weight: 1.5 };
}

/** Stochastic: classic oversold/overbought zones + %K/%D cross. */
export function scoreStochastic(k: number, d: number): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (k < 20 && d < 20) {
    signal = 'BULLISH';
    score = k > d ? 70 : 50; // %K crossing above %D in oversold = strongest
  } else if (k > 80 && d > 80) {
    signal = 'BEARISH';
    score = k < d ? -70 : -50;
  } else if (k < 30) {
    signal = 'BULLISH'; score = 30;
  } else if (k > 70) {
    signal = 'BEARISH'; score = -30;
  }

  return { name: 'Stochastic (14,3)', signal, score, weight: 1.5 };
}

/** CCI: oversold < –100, overbought > +100. */
export function scoreCCI(cci: number): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (cci < -200)      { signal = 'BULLISH'; score = 60;  }
  else if (cci < -100) { signal = 'BULLISH'; score = 35;  }
  else if (cci > 200)  { signal = 'BEARISH'; score = -60; }
  else if (cci > 100)  { signal = 'BEARISH'; score = -35; }

  return { name: 'CCI (20)', signal, score, weight: 1 };
}

// ─── Phase-2 Scorers ────────────────────────────────────────────────

/**
 * ADX: measures trend strength (directionless).
 * ADX > 25 means trending; +DI vs -DI gives direction.
 */
export function scoreADX(adx: ADXResult): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  const isBullish = adx.plusDI > adx.minusDI;

  if (adx.adx >= 40) {
    // Strong trend
    signal = isBullish ? 'BULLISH' : 'BEARISH';
    score = isBullish ? 60 : -60;
  } else if (adx.adx >= 25) {
    // Moderate trend
    signal = isBullish ? 'BULLISH' : 'BEARISH';
    score = isBullish ? 35 : -35;
  } else {
    // Weak / no trend → ranging market, neutral
    score = 0;
  }

  return { name: 'ADX (14)', signal, score, weight: 1.5 };
}

/** Ichimoku Cloud: price position vs cloud + TK cross. */
export function scoreIchimoku(ich: IchimokuResult): IndicatorResult {
  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  // Cloud position
  if (ich.signal === 'ABOVE_CLOUD') {
    signal = 'BULLISH';
    score = ich.tkCross === 'BULLISH' ? 70 : 45;
  } else if (ich.signal === 'BELOW_CLOUD') {
    signal = 'BEARISH';
    score = ich.tkCross === 'BEARISH' ? -70 : -45;
  } else {
    // IN_CLOUD → indecision
    score = ich.tkCross === 'BULLISH' ? 15 : ich.tkCross === 'BEARISH' ? -15 : 0;
  }

  return { name: 'Ichimoku Cloud', signal, score, weight: 2 };
}

/** VWAP: price above VWAP → bullish, below → bearish. Magnitude based on deviation %. */
export function scoreVWAP(currentPrice: number, vwap: number): IndicatorResult {
  const devPct = ((currentPrice - vwap) / vwap) * 100;

  let signal: SignalDirection = 'NEUTRAL';
  let score = 0;

  if (devPct > 5)        { signal = 'BULLISH'; score = 50;  }
  else if (devPct > 2)   { signal = 'BULLISH'; score = 30;  }
  else if (devPct > 0.5) { signal = 'BULLISH'; score = 15;  }
  else if (devPct < -5)  { signal = 'BEARISH'; score = -50; }
  else if (devPct < -2)  { signal = 'BEARISH'; score = -30; }
  else if (devPct < -0.5){ signal = 'BEARISH'; score = -15; }

  return { name: 'VWAP', signal, score, weight: 1 };
}

// ─── Composite Signal ────────────────────────────────────────────────

export interface CompositeSignal {
  overallSignal: string;
  signalScore: number;
  signalSummary: string;
  indicatorBreakdown: string;
}

/** Calculate weighted-average score and map to a signal label. */
export function computeWeightedScore(results: IndicatorResult[]): {
  score: number;
  signal: string;
} {
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const raw = totalWeight > 0
    ? results.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight
    : 0;
  const score = Math.max(-100, Math.min(100, Math.round(raw)));

  let signal: string;
  if (score >= 40) signal = 'STRONG_BUY';
  else if (score >= 15) signal = 'BUY';
  else if (score > -15) signal = 'HOLD';
  else if (score > -40) signal = 'SELL';
  else signal = 'STRONG_SELL';

  return { score, signal };
}

/** Build a human-readable breakdown string. */
export function buildBreakdown(results: IndicatorResult[]): string {
  return results
    .map(r => `${r.name}: ${r.signal} (${r.score > 0 ? '+' : ''}${r.score})`)
    .join(' | ');
}

/** Build a summary sentence. */
export function buildSummary(
  results: IndicatorResult[],
  signal: string,
  score: number,
): string {
  const bullish = results.filter(r => r.signal === 'BULLISH').length;
  const bearish = results.filter(r => r.signal === 'BEARISH').length;
  const neutral = results.filter(r => r.signal === 'NEUTRAL').length;
  return `${signal} (score: ${score}/100). ${bullish} bullish, ${bearish} bearish, ${neutral} neutral of ${results.length} indicators.`;
}

/** Convenience: collect results → weighted score → breakdown → summary. */
export function computeCompositeSignal(results: IndicatorResult[]): CompositeSignal {
  const { score, signal } = computeWeightedScore(results);
  return {
    overallSignal: signal,
    signalScore: score,
    indicatorBreakdown: buildBreakdown(results),
    signalSummary: buildSummary(results, signal, score),
  };
}
