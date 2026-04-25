import { broadcast } from "../ws/broadcaster.js";
import type { FundingRateMap } from "@sessionmap/types";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
  BNBUSDT: "BNB",
  XRPUSDT: "XRP",
};

interface PremiumIndexEntry {
  symbol: string;
  lastFundingRate: string;
}

async function fetchFundingRates(): Promise<FundingRateMap | null> {
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PremiumIndexEntry[];
    const rates: FundingRateMap = {};
    for (const entry of data) {
      const sym = SYMBOL_MAP[entry.symbol];
      if (sym && SYMBOLS.includes(entry.symbol)) {
        rates[sym] = parseFloat(entry.lastFundingRate);
      }
    }
    return rates;
  } catch {
    return null;
  }
}

export function startFundingConnector() {
  async function poll() {
    const rates = await fetchFundingRates();
    if (!rates) return;
    broadcast({ type: "funding", data: rates });
    const btcRate = rates["BTC"];
    if (btcRate !== undefined) {
      console.log(`[Funding] BTC=${(btcRate * 100).toFixed(4)}%`);
    }
  }

  poll();
  setInterval(poll, 30_000);
}
