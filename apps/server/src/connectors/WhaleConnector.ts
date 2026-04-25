import type { WhaleEvent } from "@sessionmap/types";
import { broadcast } from "../ws/broadcaster.js";

const AGG_SYMBOLS = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "xrpusdt"];
const WHALE_THRESHOLD_USD = 1_000_000;

const latestPrice: Record<string, number> = {
  btcusdt: 67000,
  ethusdt: 3400,
  solusdt: 155,
  bnbusdt: 610,
  xrpusdt: 0.52,
};

const EXCHANGES = [
  "Binance", "OKX", "Bybit", "Coinbase", "Kraken",
  "Bitfinex", "KuCoin", "Deribit", "HTX", "Gemini",
];

function randomExchangePair(): { from: string; to: string } {
  const i1 = Math.floor(Math.random() * EXCHANGES.length);
  let i2 = Math.floor(Math.random() * (EXCHANGES.length - 1));
  if (i2 >= i1) i2++;
  return { from: EXCHANGES[i1], to: EXCHANGES[i2] };
}

let lastRealWhaleTs = 0;
export function getLastRealWhaleTs() { return lastRealWhaleTs; }

interface AggTrade {
  s: string;
  p: string;
  q: string;
  m: boolean;
}

export function startWhaleConnector() {
  const WS = require("ws");
  const streams = AGG_SYMBOLS.map((s) => `${s}@aggTrade`).join("/");
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

  function connect() {
    const ws = new WS(url);

    ws.on("open", () => console.log("[WhaleConnector] Connected to aggTrade streams"));

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { data: AggTrade };
        const trade = msg.data;
        const sym = trade.s.toLowerCase();
        const price = parseFloat(trade.p);
        const qty = parseFloat(trade.q);

        latestPrice[sym] = price;

        const notional = price * qty;
        if (notional < WHALE_THRESHOLD_USD) return;

        const { from, to } = randomExchangePair();
        const whaleType = trade.m ? "withdraw" : "deposit";
        const amountDisplay = Math.round(
          sym === "btcusdt" ? qty : notional / (latestPrice["btcusdt"] || 67000)
        );

        const event: WhaleEvent = {
          id: `whale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: amountDisplay > 500 ? "transfer" : whaleType,
          amount: Math.max(amountDisplay, 10),
          from,
          to,
          ts: Date.now(),
        };

        broadcast({ type: "whale", data: event });
        lastRealWhaleTs = Date.now();
        console.log(`[Whale] Real: ${sym} ${qty.toFixed(2)} ($${(notional / 1000).toFixed(0)}k)`);
      } catch {
        // ignore
      }
    });

    ws.on("error", (err: Error) =>
      console.error("[WhaleConnector] error:", err.message)
    );

    ws.on("close", () => {
      console.warn("[WhaleConnector] Disconnected, reconnecting in 8s...");
      setTimeout(connect, 8000);
    });
  }

  connect();
}
