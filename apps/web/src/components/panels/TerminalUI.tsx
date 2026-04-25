"use client";

import { useState, useEffect, useRef, memo } from "react";
import type {
  SessionInfo,
  PriceSnapshot,
  GlobeMode,
  WhaleEvent,
} from "@sessionmap/types";
import { SESSION_LABELS, SESSION_COLORS_CSS } from "@/lib/constants";
import { formatCountdown } from "@/lib/session-logic";
import { GlobeModeBar } from "./GlobeModeBar";

interface FeedEntry {
  id: string;
  time: string;
  msg: string;
  category: "whale" | "price";
}

interface TerminalUIProps {
  session: SessionInfo;
  prices: PriceSnapshot;
  onToggleTerminal: () => void;
  globeMode: GlobeMode;
  onGlobeModeChange: (mode: GlobeMode) => void;
  whaleEvents: WhaleEvent[];
  fearGreed: number | null;
}

const WHALE_COLOR: Record<string, string> = {
  transfer: "var(--accent-warm)",
  deposit: "var(--session-europe)",
  withdraw: "var(--danger)",
  dex: "var(--accent)",
};

export const TerminalUI = memo(function TerminalUI({
  session,
  prices,
  onToggleTerminal,
  globeMode,
  onGlobeModeChange,
  whaleEvents,
  fearGreed,
}: TerminalUIProps) {
  const { active, nextEvent, volatility } = session;

  // ── Live feed — real WS data ───────────────────────────────────────────────
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const pricesRef = useRef(prices);
  pricesRef.current = prices;

  // Whale events from WS → feed
  const latestWhaleId = whaleEvents[0]?.id;
  useEffect(() => {
    const w = whaleEvents[0];
    if (!w) return;
    const time = new Date(w.ts).toISOString().slice(11, 19);
    setFeed((prev) =>
      [
        {
          id: w.id,
          time,
          msg: `[${w.type.toUpperCase().padEnd(8)}] ${w.amount.toLocaleString()} BTC  ${w.from} → ${w.to}`,
          category: "whale" as const,
        },
        ...prev,
      ].slice(0, 60),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestWhaleId]);

  // Real price tick every 6 s
  useEffect(() => {
    const id = setInterval(() => {
      const entries = Object.entries(pricesRef.current);
      if (!entries.length) return;
      const [sym, entry] = entries[Math.floor(Math.random() * entries.length)];
      const priceStr =
        entry.price >= 1000
          ? `$${entry.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
          : `$${entry.price.toFixed(4)}`;
      const chgStr = `${entry.change24h >= 0 ? "+" : ""}${entry.change24h.toFixed(2)}%`;
      const time = new Date().toISOString().slice(11, 19);
      setFeed((prev) =>
        [
          {
            id: `price-${Date.now()}`,
            time,
            msg: `${sym.padEnd(4)} ${priceStr.padStart(12)}  ${chgStr}`,
            category: "price" as const,
          },
          ...prev,
        ].slice(0, 60),
      );
    }, 6000);
    return () => clearInterval(id);
  }, []);

  // ── Styles ────────────────────────────────────────────────────────────────
  const sidePanel: React.CSSProperties = {
    background: "rgba(0,0,0,0.82)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden", // grid cell must be bounded
    minHeight: 0,
  };
  const sidePanelScroll: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };
  const hdr: React.CSSProperties = {
    fontSize: "9px",
    color: "var(--fg-muted)",
    fontFamily: "var(--font-mono, monospace)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: "6px",
  };
  const row: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "none",
      }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "9px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(0,255,159,0.10)",
          background: "rgba(0,0,0,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          flexShrink: 0,
          pointerEvents: "all",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11px",
              color: "var(--accent)",
              letterSpacing: "0.12em",
            }}
          >
            {">> "} SESSIONMAP TERMINAL
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "10px",
              color: "var(--fg-muted)",
            }}
          >
            {new Date().toISOString().slice(11, 19)} UTC
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <GlobeModeBar mode={globeMode} onChange={onGlobeModeChange} />
          <button
            onClick={onToggleTerminal}
            style={{
              pointerEvents: "all",
              background: "none",
              border: "1px solid rgba(0,255,159,0.25)",
              borderRadius: "3px",
              padding: "3px 10px",
              cursor: "pointer",
              color: "var(--accent)",
              fontSize: "10px",
              fontFamily: "var(--font-mono, monospace)",
              letterSpacing: "0.08em",
            }}
          >
            [EXIT]
          </button>
        </div>
      </div>

      {/* ── Main grid: left 220 | center (globe) | right 220 ───────────── */}
      <div
        className="terminal-grid"
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "220px 1fr 220px",
          overflow: "hidden",
        }}
      >
        {/* ── LEFT: session status ─────────────────────────────────────── */}
        <div
          className="terminal-left-panel"
          style={{
            ...sidePanel,
            borderRight: "1px solid rgba(0,255,159,0.08)",
          }}
        >
          <div style={sidePanelScroll}>
            <div style={hdr}>SESSION STATUS</div>

            {active.length === 0 ? (
              <div
                style={{
                  color: "var(--fg-dim)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                ○ ALL CLOSED
              </div>
            ) : (
              active.map((s) => (
                <div key={s} style={{ ...row, marginBottom: "2px" }}>
                  <span
                    style={{
                      color: SESSION_COLORS_CSS[s],
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "11px",
                    }}
                  >
                    &gt;&gt; {SESSION_LABELS[s].toUpperCase()}
                  </span>
                  <span
                    style={{
                      color: "#00FF9F",
                      fontSize: "9px",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    LIVE
                  </span>
                </div>
              ))
            )}

            {active.length > 1 && (
              <div
                style={{
                  color: "var(--overlap)",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                ⚡ OVERLAP ACTIVE
              </div>
            )}

            {nextEvent && (
              <div style={{ marginTop: "4px" }}>
                <div
                  style={{
                    color: "var(--fg-muted)",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono, monospace)",
                    marginBottom: "2px",
                  }}
                >
                  NEXT EVENT
                </div>
                <div style={row}>
                  <span
                    style={{
                      color: SESSION_COLORS_CSS[nextEvent.session],
                      fontSize: "10px",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {SESSION_LABELS[nextEvent.session].toUpperCase()}{" "}
                    {nextEvent.type === "open" ? "OPEN" : "CLOSE"}
                  </span>
                  <span
                    style={{
                      color: "var(--fg)",
                      fontWeight: 500,
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "11px",
                    }}
                  >
                    {formatCountdown(nextEvent.hours)}
                  </span>
                </div>
              </div>
            )}

            {/* All sessions list */}
            <div
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={hdr}>ALL SESSIONS</div>
              {(["asia", "europe", "americas"] as const).map((s) => {
                const on = active.includes(s);
                return (
                  <div key={s} style={{ ...row, marginBottom: "4px" }}>
                    <span
                      style={{
                        color: on ? SESSION_COLORS_CSS[s] : "var(--fg-dim)",
                        fontSize: "10px",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {on ? "▶" : "○"} {SESSION_LABELS[s].toUpperCase()}
                    </span>
                    <span
                      style={{
                        color: on ? "var(--fg)" : "var(--fg-dim)",
                        fontSize: "10px",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {s === "asia"
                        ? "00–09"
                        : s === "europe"
                          ? "07–16"
                          : "13–22"}{" "}
                      UTC
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Market stats */}
            <div
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={hdr}>MARKET</div>
              <div style={{ ...row, marginBottom: "3px" }}>
                <span
                  style={{
                    color: "var(--fg-muted)",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  VOLATILITY
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 600,
                    color:
                      volatility === "high"
                        ? "var(--danger)"
                        : volatility === "medium"
                          ? "var(--accent-warm)"
                          : "var(--fg-muted)",
                  }}
                >
                  {volatility.toUpperCase()}
                </span>
              </div>
              {fearGreed != null && (
                <div style={row}>
                  <span
                    style={{
                      color: "var(--fg-muted)",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    F&amp;G INDEX
                  </span>
                  <span
                    style={{
                      color: "var(--accent-warm)",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: 500,
                    }}
                  >
                    {fearGreed}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER: globe shows through ───────────────────────────────── */}
        <div className="terminal-center-void" />

        {/* ── RIGHT: whale alerts + live feed ──────────────────────────── */}
        <div
          className="terminal-right-panel"
          style={{
            ...sidePanel,
            borderLeft: "1px solid rgba(0,255,159,0.08)",
          }}
        >
          <div style={{ ...sidePanelScroll, gap: 0, overflowY: "hidden" }}>
            {/* Whale alerts */}
            <div style={{ flexShrink: 0 }}>
              <div style={hdr}>WHALE ALERTS</div>
              {whaleEvents.length === 0 ? (
                <div
                  style={{
                    color: "var(--fg-dim)",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono, monospace)",
                    marginBottom: "6px",
                  }}
                >
                  Waiting…
                </div>
              ) : (
                whaleEvents.slice(0, 5).map((w) => (
                  <div
                    key={w.id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${WHALE_COLOR[w.type] ?? "var(--fg-dim)"}33`,
                      borderRadius: "4px",
                      padding: "4px 8px",
                      marginBottom: "4px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "9px",
                          color: WHALE_COLOR[w.type] ?? "var(--fg-muted)",
                          fontFamily: "var(--font-mono, monospace)",
                          textTransform: "uppercase",
                        }}
                      >
                        {w.type}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--accent-warm)",
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 600,
                        }}
                      >
                        {w.amount.toLocaleString()} BTC
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "var(--fg-muted)",
                        fontFamily: "var(--font-mono, monospace)",
                        marginTop: "1px",
                      }}
                    >
                      {w.from} → {w.to}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(0,255,159,0.08)",
                margin: "6px 0",
                flexShrink: 0,
              }}
            />

            {/* Live feed */}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ ...hdr, flexShrink: 0 }}>LIVE FEED</div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {feed.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      gap: "8px",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono, monospace)",
                      marginBottom: "2px",
                    }}
                  >
                    <span style={{ color: "var(--fg-dim)", flexShrink: 0 }}>
                      {entry.time}
                    </span>
                    <span
                      style={{
                        color:
                          entry.category === "whale"
                            ? "var(--accent-warm)"
                            : "var(--fg)",
                        wordBreak: "break-all",
                      }}
                    >
                      {entry.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: real-time price bar ──────────────────────────────────── */}
      <div
        className="terminal-bottom-bar"
        style={{
          borderTop: "1px solid rgba(0,255,159,0.10)",
          background: "rgba(0,0,0,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          display: "flex",
          flexShrink: 0,
        }}
      >
        {Object.entries(prices).map(([sym, entry], i, arr) => {
          const isPos = entry.change24h >= 0;
          const priceStr =
            entry.price >= 1000
              ? entry.price.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })
              : entry.price.toFixed(4);
          return (
            <div
              key={sym}
              style={{
                flex: 1,
                padding: "7px 14px",
                borderRight:
                  i < arr.length - 1
                    ? "1px solid rgba(0,255,159,0.08)"
                    : "none",
                display: "flex",
                gap: "10px",
                alignItems: "center",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--fg-muted)",
                  letterSpacing: "0.08em",
                }}
              >
                {sym}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--fg)",
                  fontWeight: 500,
                }}
              >
                ${priceStr}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: isPos ? "#34D399" : "var(--danger)",
                }}
              >
                {isPos ? "+" : ""}
                {entry.change24h.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
