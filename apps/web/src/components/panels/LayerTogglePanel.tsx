"use client";

import { useState } from "react";
import { useLayerControls } from "@/hooks/useLayers";
import type { LayerKey } from "@/hooks/useLayers";

interface LayerDef {
  key: LayerKey;
  label: string;
  icon: string;
}

const LAYERS: LayerDef[] = [
  { key: "cities",    label: "Міста",    icon: "◆" },
  { key: "resources", label: "Ресурси",  icon: "▲" },
  { key: "straits",   label: "Протоки",  icon: "⬡" },
  { key: "cables",    label: "Кабелі",   icon: "∿" },
  { key: "borders",   label: "Кордони",  icon: "▭" },
  { key: "seasons",   label: "Сезони",   icon: "◑" },
];

const ACTIVE_COLORS: Record<LayerKey, string> = {
  cities:    "#e2e8f0",
  resources: "#f97316",
  straits:   "#f472b6",
  cables:    "#22d3ee",
  borders:   "#7dba8c",
  seasons:   "#fbbf24",
};

export function LayerTogglePanel() {
  const [open, setOpen] = useState(false);
  const [layers, toggle] = useLayerControls();

  const activeCount = Object.values(layers).filter(Boolean).length;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "72px",
        right: "16px",
        pointerEvents: "all",
        zIndex: 400,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "8px",
        userSelect: "none",
      }}
    >
      {/* Layer items — expand upward */}
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            alignItems: "flex-end",
          }}
        >
          {LAYERS.map((layer) => {
            const on = layers[layer.key];
            const col = ACTIVE_COLORS[layer.key];
            return (
              <button
                key={layer.key}
                onClick={() => toggle(layer.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: on ? "rgba(8,11,20,0.92)" : "rgba(8,11,20,0.72)",
                  border: `1px solid ${on ? col + "55" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "6px",
                  padding: "6px 10px",
                  cursor: "pointer",
                  color: on ? col : "rgba(255,255,255,0.3)",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "11px",
                  letterSpacing: "0.05em",
                  transition: "border-color 0.2s, color 0.2s, background 0.2s",
                  boxShadow: on ? `0 0 0 1px ${col}22, 0 2px 12px rgba(0,0,0,0.5)` : "0 2px 8px rgba(0,0,0,0.4)",
                  minWidth: "130px",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <span style={{ fontSize: "10px", opacity: on ? 0.9 : 0.3 }}>{layer.icon}</span>
                  <span>{layer.label}</span>
                </div>
                {/* Toggle pill */}
                <div
                  style={{
                    width: "24px",
                    height: "12px",
                    borderRadius: "6px",
                    background: on ? col : "rgba(255,255,255,0.08)",
                    border: `1px solid ${on ? col + "66" : "rgba(255,255,255,0.12)"}`,
                    position: "relative",
                    transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "1px",
                      left: on ? "11px" : "1px",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: on ? "rgba(8,11,20,0.9)" : "rgba(255,255,255,0.2)",
                      transition: "left 0.18s",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((p) => !p)}
        title="Toggle layers"
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: open ? "rgba(34,211,238,0.15)" : "rgba(8,11,20,0.88)",
          border: `1px solid ${open ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.12)"}`,
          cursor: "pointer",
          color: open ? "#22d3ee" : "rgba(255,255,255,0.6)",
          fontSize: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          transition: "background 0.2s, border-color 0.2s, color 0.2s",
          position: "relative",
        }}
      >
        ⊞
        {/* Active layer count badge */}
        {!open && activeCount < LAYERS.length && (
          <div
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "#f97316",
              border: "1px solid rgba(8,11,20,0.9)",
              fontSize: "8px",
              fontFamily: "var(--font-mono, monospace)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            {activeCount}
          </div>
        )}
      </button>
    </div>
  );
}
