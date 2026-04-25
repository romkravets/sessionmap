import WebSocket from "ws";
import { broadcast } from "../ws/broadcaster.js";
import type { LiquidationEvent } from "@sessionmap/types";

const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL",
  BNBUSDT: "BNB", XRPUSDT: "XRP",
};
const USD_THRESHOLD = 100_000;

let ws: WebSocket | null = null;

export function startLiquidationsConnector() {
  connect();
}

function connect() {
  ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");

  ws.on("open", () => {
    console.log("[Liquidations] Connected to Binance futures liquidations stream");
  });

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        data?: {
          e: string;
          o: {
            s: string;
            S: "BUY" | "SELL";
            ap: string;
            l: string;
            T: number;
          };
        };
      };
      const order = msg.data?.o;
      if (!order) return;

      const sym = SYMBOL_MAP[order.s];
      if (!sym) return;

      const price = parseFloat(order.ap);
      const qty = parseFloat(order.l);
      const usdValue = price * qty;
      if (usdValue < USD_THRESHOLD) return;

      const event: LiquidationEvent = {
        id: `liq-${order.T}-${order.s}`,
        symbol: sym,
        // BUY side = short position liquidated (forced to buy back)
        // SELL side = long position liquidated (forced to sell)
        side: order.S === "BUY" ? "SHORT" : "LONG",
        qty,
        price,
        usdValue,
        ts: order.T,
      };

      broadcast({ type: "liquidation", data: event });
      console.log(`[Liquidations] ${sym} ${event.side} $${(usdValue / 1000).toFixed(0)}K`);
    } catch {
      // ignore malformed
    }
  });

  ws.on("close", () => {
    console.log("[Liquidations] Disconnected, reconnecting in 5s…");
    setTimeout(connect, 5_000);
  });

  ws.on("error", (err) => {
    console.error("[Liquidations] WS error:", err.message);
  });
}
