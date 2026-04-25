import type { MarketMeta } from "@sessionmap/types";
import { getCachedMeta, setCachedMeta } from "../services/PriceService.js";

const COINGECKO_URL =
  process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";

interface FngResponse {
  data: Array<{ value: string; value_classification: string }>;
}

async function fetchFearGreed(): Promise<number | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as FngResponse;
    const val = parseInt(json.data[0]?.value ?? "", 10);
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

async function fetchGlobalMeta(): Promise<Partial<MarketMeta>> {
  try {
    const res = await fetch(`${COINGECKO_URL}/global`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      data: {
        market_cap_percentage: Record<string, number>;
        total_market_cap: Record<string, number>;
      };
    };
    return {
      btcDominance: json.data.market_cap_percentage?.["btc"] ?? undefined,
      totalMarketCap: json.data.total_market_cap?.["usd"] ?? undefined,
    };
  } catch {
    return {};
  }
}

export function startCoinGeckoPoller(onUpdate: (meta: MarketMeta) => void) {
  async function poll() {
    const [globalMeta, fearGreed] = await Promise.all([
      fetchGlobalMeta(),
      fetchFearGreed(),
    ]);

    const prev = getCachedMeta();
    const next: MarketMeta = {
      fearGreed: fearGreed ?? prev.fearGreed,
      btcDominance: globalMeta.btcDominance ?? prev.btcDominance,
      totalMarketCap: globalMeta.totalMarketCap ?? prev.totalMarketCap,
    };

    setCachedMeta(next);
    onUpdate(next);
    console.log(`[CoinGecko] F&G=${next.fearGreed} BTC.dom=${(next.btcDominance ?? 0).toFixed(1)}%`);
  }

  poll();
  setInterval(poll, 60_000);
}
