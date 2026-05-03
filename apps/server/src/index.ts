import http from "http";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from "ws";
import { healthRouter } from "./routes/health.js";
import { createBroadcaster, broadcast } from "./ws/broadcaster.js";
import {
  startBinanceConnector,
  bootstrapPrices,
} from "./connectors/BinanceConnector.js";
import {
  getPriceSnapshot,
  getCachedMeta,
  onPriceUpdate,
} from "./services/PriceService.js";
import { startCoinGeckoPoller } from "./connectors/CoinGeckoConnector.js";
import { startWhaleConnector } from "./connectors/WhaleConnector.js";
import { startLiquidationsConnector } from "./connectors/LiquidationsConnector.js";
import { startFundingConnector } from "./connectors/FundingConnector.js";
import { startEthGasConnector } from "./connectors/EthGasConnector.js";
import { startWhaleService } from "./services/WhaleService.js";
import { startCommodityConnector, getCachedCommodities } from "./connectors/CommodityConnector.js";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(express.json());

// CORS — only allow our web client
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === CLIENT_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", CLIENT_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Rate limit — 100 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use("/api", healthRouter);

// ── HTTP + WS server ──────────────────────────────────────────────────────────
const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  // Only accept connections from our client origin
  verifyClient: ({ origin }, cb) => {
    const allowed = !origin || origin === CLIENT_ORIGIN;
    cb(allowed, 403, "Forbidden origin");
  },
});

createBroadcaster(wss);

// Send snapshot to new clients immediately on connection
wss.on("connection", (ws) => {
  // Brief delay so createBroadcaster registers listeners first
  setImmediate(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "prices", data: getPriceSnapshot() }));
      ws.send(JSON.stringify({ type: "meta", data: getCachedMeta() }));
      ws.send(JSON.stringify({ type: "commodities", data: getCachedCommodities() }));
    }
  });
});

// ── Data connectors ───────────────────────────────────────────────────────────
onPriceUpdate(() => {
  broadcast({ type: "prices", data: getPriceSnapshot() });
});

// Fetch real prices via REST first so first WS snapshot is never stale
bootstrapPrices().then(() => {
  startBinanceConnector();
});

startCoinGeckoPoller((meta) => {
  broadcast({ type: "meta", data: meta });
});

startWhaleConnector();
startWhaleService();
startLiquidationsConnector();
startFundingConnector();
startEthGasConnector();
startCommodityConnector();

// ── Start listening ───────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
  console.log(`[Server] WS on ws://localhost:${PORT}`);
  console.log(`[Server] Accepting connections from: ${CLIENT_ORIGIN}`);
});
