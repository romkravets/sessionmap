"use client";

import { useState, useEffect, useRef, memo } from "react";

interface Position {
  x: number;
  y: number;
  visible: boolean;
}

const CAPITALS = [
  { id: "london",    name: "London",      lat: 51.51,  lng: -0.13,   gdp: 4.0 },
  { id: "newyork",   name: "New York",    lat: 40.71,  lng: -74.01,  gdp: 3.0 },
  { id: "tokyo",     name: "Tokyo",       lat: 35.68,  lng: 139.69,  gdp: 2.1 },
  { id: "beijing",   name: "Beijing",     lat: 39.91,  lng: 116.39,  gdp: 1.9 },
  { id: "shanghai",  name: "Shanghai",    lat: 31.23,  lng: 121.47,  gdp: 1.8 },
  { id: "dubai",     name: "Dubai",       lat: 25.20,  lng: 55.27,   gdp: 0.5 },
  { id: "singapore", name: "Singapore",   lat: 1.35,   lng: 103.82,  gdp: 0.7 },
  { id: "paris",     name: "Paris",       lat: 48.86,  lng: 2.35,    gdp: 0.8 },
  { id: "frankfurt", name: "Frankfurt",   lat: 50.11,  lng: 8.68,    gdp: 0.4 },
  { id: "zurich",    name: "Zurich",      lat: 47.38,  lng: 8.54,    gdp: 0.3 },
  { id: "hongkong",  name: "Hong Kong",   lat: 22.32,  lng: 114.17,  gdp: 0.5 },
  { id: "sydney",    name: "Sydney",      lat: -33.87, lng: 151.21,  gdp: 0.4 },
  { id: "toronto",   name: "Toronto",     lat: 43.65,  lng: -79.38,  gdp: 0.5 },
  { id: "chicago",   name: "Chicago",     lat: 41.88,  lng: -87.63,  gdp: 0.6 },
  { id: "seoul",     name: "Seoul",       lat: 37.57,  lng: 126.98,  gdp: 0.7 },
  { id: "moscow",    name: "Moscow",      lat: 55.75,  lng: 37.62,   gdp: 0.4 },
  { id: "mumbai",    name: "Mumbai",      lat: 19.08,  lng: 72.88,   gdp: 0.4 },
  { id: "saopablo",  name: "São Paulo",   lat: -23.55, lng: -46.63,  gdp: 0.4 },
  { id: "amsterdam", name: "Amsterdam",   lat: 52.37,  lng: 4.90,    gdp: 0.3 },
] as const;

type Capital = (typeof CAPITALS)[number];

export const WorldCapitals = memo(function WorldCapitals() {
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      if (!window.globeProject) {
        rafRef.current = requestAnimationFrame(update);
        return;
      }
      const next: Record<string, Position> = {};
      CAPITALS.forEach((c) => {
        next[c.id] = window.globeProject!(c.lat, c.lng);
      });
      setPositions(next);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {CAPITALS.map((cap: Capital) => {
        const pos = positions[cap.id];
        if (!pos?.visible) return null;
        const isHov = hoveredId === cap.id;

        return (
          <div
            key={cap.id}
            onMouseEnter={() => setHoveredId(cap.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              transform: "translate(-50%, -50%)",
              pointerEvents: "all",
              cursor: "default",
              zIndex: isHov ? 80 : 5,
            }}
          >
            {/* Small crosshair / plus marker */}
            <div
              style={{
                position: "relative",
                width: 8,
                height: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Horizontal bar */}
              <div
                style={{
                  position: "absolute",
                  width: isHov ? 10 : 8,
                  height: 1,
                  background: isHov
                    ? "rgba(255,255,255,0.75)"
                    : "rgba(255,255,255,0.4)",
                  transition: "width 0.15s, background 0.15s",
                }}
              />
              {/* Vertical bar */}
              <div
                style={{
                  position: "absolute",
                  width: 1,
                  height: isHov ? 10 : 8,
                  background: isHov
                    ? "rgba(255,255,255,0.75)"
                    : "rgba(255,255,255,0.4)",
                  transition: "height 0.15s, background 0.15s",
                }}
              />
            </div>

            {/* Name label — only on hover */}
            {isHov && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "-20px",
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  background: "rgba(8,11,20,0.85)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "4px",
                  padding: "2px 7px",
                  fontSize: "8px",
                  fontFamily: "var(--font-mono, monospace)",
                  color: "rgba(255,255,255,0.75)",
                  letterSpacing: "0.06em",
                  pointerEvents: "none",
                }}
              >
                {cap.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
