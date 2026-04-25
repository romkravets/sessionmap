// ── WS Message Types ─────────────────────────────────────────────────────────

export type WsMessage =
  | { type: "prices"; data: PriceSnapshot }
  | { type: "meta"; data: MarketMeta }
  | { type: "whale"; data: WhaleEvent };

export type PriceSnapshot = Record<
  string,
  { price: number; change24h: number }
>;

export interface MarketMeta {
  fearGreed: number;
  btcDominance: number;
  totalMarketCap: number;
}

export interface WhaleEvent {
  id: string;
  type: "transfer" | "deposit" | "withdraw" | "dex";
  amount: number;
  from: string;
  to: string;
  ts: number;
}

// ── Exchange / Globe Types ────────────────────────────────────────────────────

export type SessionRegion = "asia" | "europe" | "americas";

export interface Exchange {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  vol: number;
  share: number;
  pairs: number;
  region: SessionRegion;
  year: number;
}

// ── Session Types ─────────────────────────────────────────────────────────────

export interface SessionEvent {
  type: "open" | "close";
  session: SessionRegion;
  hours: number;
}

export type VolatilityLevel = "low" | "medium" | "high";

export interface SessionInfo {
  active: SessionRegion[];
  nextEvent: SessionEvent | null;
  volatility: VolatilityLevel;
  utcH: number;
}

// ── App State ─────────────────────────────────────────────────────────────────

export type GlobeMode = "auto" | "free" | "follow";
export type WsStatus = "connecting" | "connected" | "disconnected";

export interface TweakValues {
  rotationSpeed: number;
  showTerminator: boolean;
  showSunMarker: boolean;
  markerPulse: boolean;
  timeOffset: number;
}

export interface AppState {
  prices: PriceSnapshot;
  marketMeta: MarketMeta | null;
  whaleEvents: WhaleEvent[];
  globeMode: GlobeMode;
  terminalMode: boolean;
  tweaks: TweakValues;
  wsStatus: WsStatus;
}
