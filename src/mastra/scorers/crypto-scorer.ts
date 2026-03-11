import { z } from 'zod';
import { createScorer } from '@mastra/core/evals';
import {
  getAssistantMessageFromRunOutput,
  getUserMessageFromRunInput,
} from '@mastra/evals/scorers/utils';

// ─── Signal Quality Scorer ───────────────────────────────────────────
// LLM-judged scorer that evaluates the quality and completeness of
// crypto trading analysis and signals produced by the agent.

export const signalQualityScorer = createScorer({
  id: 'signal-quality-scorer',
  name: 'Signal Quality',
  description:
    'Evaluates the quality, accuracy, and completeness of crypto trading analysis and signal generation',
  type: 'agent',
  judge: {
    model: 'google/gemini-2.5-pro',
    instructions:
      'You are an expert evaluator of cryptocurrency trading analysis quality. ' +
      'Assess whether the analysis includes proper technical indicators, risk warnings, ' +
      'actionable signals, and a financial disclaimer. ' +
      'Return only the structured JSON matching the provided schema.',
  },
})
  .preprocess(({ run }) => {
    const userText = getUserMessageFromRunInput(run.input) || '';
    const assistantText = getAssistantMessageFromRunOutput(run.output) || '';
    return { userText, assistantText };
  })
  .analyze({
    description: 'Evaluate crypto analysis quality on multiple dimensions',
    outputSchema: z.object({
      hasSignal: z.boolean().describe('Whether the response includes a clear trading signal (buy/sell/hold)'),
      hasTechnicalAnalysis: z.boolean().describe('Whether RSI, MACD, SMA, or other technical indicators are discussed'),
      hasRiskWarning: z.boolean().describe('Whether risk factors or warnings are mentioned'),
      hasDisclaimer: z.boolean().describe('Whether a "not financial advice" disclaimer is included'),
      hasPriceData: z.boolean().describe('Whether actual price data and numbers are included'),
      hasActionableInsight: z.boolean().describe('Whether the response provides clear actionable recommendations'),
      reasoning: z.string().describe('Brief explanation of the evaluation'),
      overallQuality: z.number().min(0).max(1).describe('Overall quality score from 0 to 1'),
    }),
    createPrompt: ({ results }) => `
You are evaluating a crypto trading assistant's response quality.

User query:
"""
${results.preprocessStepResult.userText}
"""

Assistant response:
"""
${results.preprocessStepResult.assistantText}
"""

Evaluate the response on these criteria:
1. Does it include a clear trading signal (STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL)?
2. Does it reference technical analysis indicators (RSI, MACD, SMA, Bollinger Bands, etc.)?
3. Does it mention risk factors or warnings about volatility?
4. Does it include a disclaimer about not being financial advice?
5. Does it include actual price data and numerical values?
6. Does it provide clear, actionable recommendations?

Return JSON with the schema fields. For overallQuality:
- 1.0: Excellent - all criteria met with detailed analysis
- 0.7-0.9: Good - most criteria met
- 0.4-0.6: Average - some criteria met but gaps
- 0.1-0.3: Poor - minimal analysis
- 0.0: No relevant analysis provided
`,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};

    // Weighted scoring
    let score = 0;
    let totalWeight = 0;

    const criteria = [
      { met: r.hasSignal, weight: 2.5 },
      { met: r.hasTechnicalAnalysis, weight: 2.5 },
      { met: r.hasRiskWarning, weight: 1.5 },
      { met: r.hasDisclaimer, weight: 1 },
      { met: r.hasPriceData, weight: 1.5 },
      { met: r.hasActionableInsight, weight: 2 },
    ];

    for (const c of criteria) {
      totalWeight += c.weight;
      if (c.met) score += c.weight;
    }

    const criteriaScore = totalWeight > 0 ? score / totalWeight : 0;

    // Blend with LLM's overall quality assessment (60% criteria, 40% LLM judgment)
    const llmQuality = typeof r.overallQuality === 'number' ? r.overallQuality : 0.5;
    return Number.parseFloat((criteriaScore * 0.6 + llmQuality * 0.4).toFixed(3));
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    const met: string[] = [];
    const missed: string[] = [];

    if (r.hasSignal) met.push('signal'); else missed.push('signal');
    if (r.hasTechnicalAnalysis) met.push('TA'); else missed.push('TA');
    if (r.hasRiskWarning) met.push('risk warning'); else missed.push('risk warning');
    if (r.hasDisclaimer) met.push('disclaimer'); else missed.push('disclaimer');
    if (r.hasPriceData) met.push('price data'); else missed.push('price data');
    if (r.hasActionableInsight) met.push('actionable insight'); else missed.push('actionable insight');

    return (
      `Score: ${score}. ` +
      `Met: ${met.join(', ') || 'none'}. ` +
      `Missing: ${missed.join(', ') || 'none'}. ` +
      `${r.reasoning || ''}`
    );
  });

export const scorers = {
  signalQualityScorer,
};
