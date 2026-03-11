import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FEAR_GREED_API = 'https://api.alternative.me/fng';

interface FearGreedResponse {
  data: {
    value: string;
    value_classification: string;
    timestamp: string;
  }[];
}

interface TrendingCoin {
  item: {
    id: string;
    coin_id: number;
    name: string;
    symbol: string;
    market_cap_rank: number;
    score: number;
    data?: {
      price: number;
      price_change_percentage_24h?: Record<string, number>;
    };
  };
}

export const getMarketSentiment = createTool({
  id: 'get-market-sentiment',
  description:
    'Get overall crypto market sentiment including the Fear & Greed Index, trending coins, and global market metrics. Useful for gauging market mood and identifying momentum.',
  inputSchema: z.object({
    includeTrending: z
      .boolean()
      .optional()
      .describe('Whether to include trending coins (default: true)'),
  }),
  outputSchema: z.object({
    fearGreedIndex: z.object({
      value: z.number(),
      classification: z.string(),
      timestamp: z.string(),
    }),
    globalMetrics: z.object({
      totalMarketCap: z.number(),
      totalVolume24h: z.number(),
      btcDominance: z.number(),
      ethDominance: z.number(),
      marketCapChangePercentage24h: z.number(),
      activeCryptocurrencies: z.number(),
    }),
    trendingCoins: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        symbol: z.string(),
        marketCapRank: z.number().nullable(),
        score: z.number(),
      }),
    ),
    sentimentSummary: z.string(),
  }),
  execute: async (inputData) => {
    const includeTrending = inputData.includeTrending !== false;

    // Fetch all data sources in parallel
    const fetchPromises: Promise<Response>[] = [
      fetch(`${FEAR_GREED_API}/?limit=1`),
      fetch(`${COINGECKO_BASE}/global`),
    ];

    if (includeTrending) {
      fetchPromises.push(fetch(`${COINGECKO_BASE}/search/trending`));
    }

    const responses = await Promise.all(fetchPromises);

    // Parse Fear & Greed Index
    let fearGreedValue = 50;
    let fearGreedClassification = 'Neutral';
    let fearGreedTimestamp = new Date().toISOString();

    if (responses[0].ok) {
      const fgData = (await responses[0].json()) as FearGreedResponse;
      if (fgData.data?.[0]) {
        fearGreedValue = Number.parseInt(fgData.data[0].value, 10);
        fearGreedClassification = fgData.data[0].value_classification;
        fearGreedTimestamp = new Date(
          Number.parseInt(fgData.data[0].timestamp, 10) * 1000,
        ).toISOString();
      }
    }

    // Parse Global data
    let globalMetrics = {
      totalMarketCap: 0,
      totalVolume24h: 0,
      btcDominance: 0,
      ethDominance: 0,
      marketCapChangePercentage24h: 0,
      activeCryptocurrencies: 0,
    };

    if (responses[1].ok) {
      const globalData = (await responses[1].json()) as {
        data: {
          total_market_cap: Record<string, number>;
          total_volume: Record<string, number>;
          market_cap_percentage: Record<string, number>;
          market_cap_change_percentage_24h_usd: number;
          active_cryptocurrencies: number;
        };
      };

      globalMetrics = {
        totalMarketCap: globalData.data.total_market_cap['usd'] || 0,
        totalVolume24h: globalData.data.total_volume['usd'] || 0,
        btcDominance: Number.parseFloat(
          (globalData.data.market_cap_percentage['btc'] || 0).toFixed(2),
        ),
        ethDominance: Number.parseFloat(
          (globalData.data.market_cap_percentage['eth'] || 0).toFixed(2),
        ),
        marketCapChangePercentage24h: Number.parseFloat(
          (globalData.data.market_cap_change_percentage_24h_usd || 0).toFixed(2),
        ),
        activeCryptocurrencies: globalData.data.active_cryptocurrencies,
      };
    }

    // Parse Trending coins
    let trendingCoins: { id: string; name: string; symbol: string; marketCapRank: number | null; score: number }[] = [];

    if (includeTrending && responses[2]?.ok) {
      const trendingData = (await responses[2].json()) as { coins: TrendingCoin[] };
      trendingCoins = (trendingData.coins || []).slice(0, 7).map((coin) => ({
        id: coin.item.id,
        name: coin.item.name,
        symbol: coin.item.symbol.toUpperCase(),
        marketCapRank: coin.item.market_cap_rank || null,
        score: coin.item.score,
      }));
    }

    // Generate summary
    let sentimentSummary = `Market Sentiment: ${fearGreedClassification} (${fearGreedValue}/100). `;
    sentimentSummary += `Total market cap: $${(globalMetrics.totalMarketCap / 1e12).toFixed(2)}T `;
    sentimentSummary += `(${globalMetrics.marketCapChangePercentage24h > 0 ? '+' : ''}${globalMetrics.marketCapChangePercentage24h}% 24h). `;
    sentimentSummary += `BTC dominance: ${globalMetrics.btcDominance}%. `;

    if (fearGreedValue <= 25) {
      sentimentSummary += 'Extreme fear in the market — historically a potential buying opportunity. ';
    } else if (fearGreedValue <= 40) {
      sentimentSummary += 'Fear in the market — caution advised but may present opportunities. ';
    } else if (fearGreedValue >= 75) {
      sentimentSummary += 'Extreme greed — market may be overextended, caution with entries. ';
    } else if (fearGreedValue >= 60) {
      sentimentSummary += 'Greed in the market — momentum is positive but watch for reversals. ';
    }

    if (trendingCoins.length > 0) {
      sentimentSummary += `Trending: ${trendingCoins.map((c) => c.symbol).join(', ')}.`;
    }

    return {
      fearGreedIndex: {
        value: fearGreedValue,
        classification: fearGreedClassification,
        timestamp: fearGreedTimestamp,
      },
      globalMetrics,
      trendingCoins,
      sentimentSummary,
    };
  },
});
