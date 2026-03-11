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
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  circulating_supply: number;
  total_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  last_updated: string;
}

export const getCryptoPrice = createTool({
  id: 'get-crypto-price',
  description:
    'Get current price, market cap, 24h volume, and price changes for one or more cryptocurrencies. Use CoinGecko IDs (e.g., "bitcoin", "ethereum", "solana", "cardano", "ripple").',
  inputSchema: z.object({
    coinIds: z
      .string()
      .describe(
        'Comma-separated CoinGecko coin IDs (e.g., "bitcoin,ethereum,solana"). Use lowercase IDs.',
      ),
    currency: z
      .string()
      .optional()
      .describe('Target currency for prices (e.g., "usd", "eur", "btc"). Defaults to "usd".'),
  }),
  outputSchema: z.object({
    coins: z.array(
      z.object({
        id: z.string(),
        symbol: z.string(),
        name: z.string(),
        price: z.number(),
        marketCap: z.number(),
        marketCapRank: z.number(),
        volume24h: z.number(),
        high24h: z.number(),
        low24h: z.number(),
        priceChange24h: z.number(),
        priceChangePercentage24h: z.number(),
        circulatingSupply: z.number(),
        ath: z.number(),
        athChangePercentage: z.number(),
        lastUpdated: z.string(),
      }),
    ),
  }),
  execute: async (inputData) => {
    const currency = inputData.currency || 'usd';
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&ids=${encodeURIComponent(inputData.coinIds)}&order=market_cap_desc&sparkline=false&price_change_percentage=7d,30d`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as CoinMarketData[];

    if (!data || data.length === 0) {
      throw new Error(
        `No data found for coin IDs: ${inputData.coinIds}. Make sure to use valid CoinGecko IDs.`,
      );
    }

    return {
      coins: data.map((coin) => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        marketCap: coin.market_cap,
        marketCapRank: coin.market_cap_rank,
        volume24h: coin.total_volume,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
        priceChange24h: coin.price_change_24h,
        priceChangePercentage24h: coin.price_change_percentage_24h,
        circulatingSupply: coin.circulating_supply,
        ath: coin.ath,
        athChangePercentage: coin.ath_change_percentage,
        lastUpdated: coin.last_updated,
      })),
    };
  },
});
