import { NextResponse } from "next/server";
import { yahooFetch } from "@/lib/yahoo-finance";

// Symbols to fetch; ^DJI = Dow Jones
const SYMBOLS = ["NVDA", "MSFT", "GOOGL", "META", "SPY", "QQQ", "^DJI"];

interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  marketState: string; // "REGULAR" | "PRE" | "POST" | "CLOSED"
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  marketState: string;
}

export const runtime = "nodejs";

export async function GET() {
  const symsParam = SYMBOLS.join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symsParam)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketState`;

  try {
    const res = await yahooFetch(url);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance responded with ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      quoteResponse: { result: YahooQuote[] };
    };

    const result = data.quoteResponse?.result ?? [];
    const quotes: StockQuote[] = result.map((q) => ({
      // Strip ^ prefix (^DJI → DJI) for cleaner display
      symbol: q.symbol.replace("^", ""),
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      marketState: q.marketState,
    }));

    // Short cache when any market is in regular session, longer otherwise
    const anyLive = quotes.some((q) => q.marketState === "REGULAR");
    const ttl = anyLive ? 60 : 900;

    return NextResponse.json(quotes, {
      headers: {
        "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=30`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
