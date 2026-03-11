import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
}

export const getMarketOverview = createTool({
  id: 'get-market-overview',
  description:
    'Get an overview of the top cryptocurrencies by market cap. Returns rankings, prices, and performance metrics.',
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe('Number of top coins to return (1-100). Defaults to 15.'),
    currency: z
      .string()
      .optional()
      .describe('Target currency (e.g., "usd"). Defaults to "usd".'),
  }),
  outputSchema: z.object({
    totalMarketCap: z.number(),
    btcDominance: z.number(),
    totalVolume24h: z.number(),
    activeCryptocurrencies: z.number(),
    marketCapChangePercentage24h: z.number(),
    topCoins: z.array(
      z.object({
        rank: z.number(),
        id: z.string(),
        symbol: z.string(),
        name: z.string(),
        price: z.number(),
        marketCap: z.number(),
        volume24h: z.number(),
        change24h: z.number(),
        change7d: z.number(),
        change30d: z.number(),
      }),
    ),
  }),
  execute: async (inputData) => {
    const currency = inputData.currency || 'usd';
    const limit = inputData.limit || 15;

    // Fetch global market data and top coins in parallel
    const [globalResponse, marketsResponse] = await Promise.all([
      fetch(`${COINGECKO_BASE}/global`),
      fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=${limit}&sparkline=false&price_change_percentage=7d,30d`,
      ),
    ]);

    if (!globalResponse.ok || !marketsResponse.ok) {
      throw new Error('CoinGecko API error fetching market overview');
    }

    const globalData = (await globalResponse.json()) as {
      data: {
        total_market_cap: Record<string, number>;
        total_volume: Record<string, number>;
        market_cap_percentage: Record<string, number>;
        active_cryptocurrencies: number;
        market_cap_change_percentage_24h_usd: number;
      };
    };

    const marketsData = (await marketsResponse.json()) as CoinMarketData[];

    return {
      totalMarketCap: globalData.data.total_market_cap[currency] || 0,
      btcDominance: globalData.data.market_cap_percentage['btc'] || 0,
      totalVolume24h: globalData.data.total_volume[currency] || 0,
      activeCryptocurrencies: globalData.data.active_cryptocurrencies,
      marketCapChangePercentage24h: globalData.data.market_cap_change_percentage_24h_usd,
      topCoins: marketsData.map((coin) => ({
        rank: coin.market_cap_rank,
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        marketCap: coin.market_cap,
        volume24h: coin.total_volume,
        change24h: coin.price_change_percentage_24h || 0,
        change7d: coin.price_change_percentage_7d_in_currency || 0,
        change30d: coin.price_change_percentage_30d_in_currency || 0,
      })),
    };
  },
});
