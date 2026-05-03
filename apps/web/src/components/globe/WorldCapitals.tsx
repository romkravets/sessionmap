"use client";

import { useState, useEffect, useRef, memo } from "react";

interface Position { x: number; y: number; visible: boolean; }

// tier: 1 = G20 capital / top financial hub, 2 = major regional capital, 3 = secondary
const CAPITALS = [
  // ── North America ──────────────────────────────────────────────────────────
  { id: "washington",   name: "Washington D.C.", country: "USA",        lat: 38.90,  lng: -77.04,  tier: 1 },
  { id: "newyork",      name: "New York",        country: "USA",        lat: 40.71,  lng: -74.01,  tier: 1 },
  { id: "chicago",      name: "Chicago",         country: "USA",        lat: 41.88,  lng: -87.63,  tier: 2 },
  { id: "losangeles",   name: "Los Angeles",     country: "USA",        lat: 34.05,  lng: -118.24, tier: 2 },
  { id: "ottawa",       name: "Ottawa",          country: "Canada",     lat: 45.42,  lng: -75.69,  tier: 2 },
  { id: "toronto",      name: "Toronto",         country: "Canada",     lat: 43.65,  lng: -79.38,  tier: 1 },
  { id: "mexicocity",   name: "Mexico City",     country: "Mexico",     lat: 19.43,  lng: -99.13,  tier: 1 },
  // ── South America ─────────────────────────────────────────────────────────
  { id: "brasilia",     name: "Brasília",        country: "Brazil",     lat: -15.79, lng: -47.88,  tier: 2 },
  { id: "saopablo",     name: "São Paulo",       country: "Brazil",     lat: -23.55, lng: -46.63,  tier: 1 },
  { id: "buenosaires",  name: "Buenos Aires",    country: "Argentina",  lat: -34.60, lng: -58.38,  tier: 1 },
  { id: "santiago",     name: "Santiago",        country: "Chile",      lat: -33.46, lng: -70.65,  tier: 2 },
  { id: "bogota",       name: "Bogotá",          country: "Colombia",   lat: 4.71,   lng: -74.07,  tier: 2 },
  { id: "lima",         name: "Lima",            country: "Peru",       lat: -12.05, lng: -77.04,  tier: 2 },
  // ── Europe ────────────────────────────────────────────────────────────────
  { id: "london",       name: "London",          country: "UK",         lat: 51.51,  lng: -0.13,   tier: 1 },
  { id: "paris",        name: "Paris",           country: "France",     lat: 48.86,  lng: 2.35,    tier: 1 },
  { id: "berlin",       name: "Berlin",          country: "Germany",    lat: 52.52,  lng: 13.41,   tier: 1 },
  { id: "frankfurt",    name: "Frankfurt",       country: "Germany",    lat: 50.11,  lng: 8.68,    tier: 1 },
  { id: "madrid",       name: "Madrid",          country: "Spain",      lat: 40.42,  lng: -3.70,   tier: 2 },
  { id: "rome",         name: "Rome",            country: "Italy",      lat: 41.90,  lng: 12.50,   tier: 2 },
  { id: "milan",        name: "Milan",           country: "Italy",      lat: 45.46,  lng: 9.19,    tier: 2 },
  { id: "amsterdam",    name: "Amsterdam",       country: "Netherlands",lat: 52.37,  lng: 4.90,    tier: 1 },
  { id: "brussels",     name: "Brussels",        country: "Belgium",    lat: 50.85,  lng: 4.35,    tier: 2 },
  { id: "zurich",       name: "Zurich",          country: "Switzerland",lat: 47.38,  lng: 8.54,    tier: 1 },
  { id: "vienna",       name: "Vienna",          country: "Austria",    lat: 48.21,  lng: 16.37,   tier: 2 },
  { id: "stockholm",    name: "Stockholm",       country: "Sweden",     lat: 59.33,  lng: 18.07,   tier: 2 },
  { id: "oslo",         name: "Oslo",            country: "Norway",     lat: 59.91,  lng: 10.75,   tier: 2 },
  { id: "copenhagen",   name: "Copenhagen",      country: "Denmark",    lat: 55.68,  lng: 12.57,   tier: 2 },
  { id: "helsinki",     name: "Helsinki",        country: "Finland",    lat: 60.17,  lng: 24.94,   tier: 2 },
  { id: "warsaw",       name: "Warsaw",          country: "Poland",     lat: 52.23,  lng: 21.01,   tier: 2 },
  { id: "prague",       name: "Prague",          country: "Czech Rep.", lat: 50.08,  lng: 14.44,   tier: 3 },
  { id: "budapest",     name: "Budapest",        country: "Hungary",    lat: 47.50,  lng: 19.04,   tier: 3 },
  { id: "bucharest",    name: "Bucharest",       country: "Romania",    lat: 44.43,  lng: 26.10,   tier: 3 },
  { id: "athens",       name: "Athens",          country: "Greece",     lat: 37.98,  lng: 23.73,   tier: 3 },
  { id: "lisbon",       name: "Lisbon",          country: "Portugal",   lat: 38.72,  lng: -9.14,   tier: 3 },
  { id: "kyiv",         name: "Kyiv",            country: "Ukraine",    lat: 50.45,  lng: 30.52,   tier: 2 },
  { id: "moscow",       name: "Moscow",          country: "Russia",     lat: 55.75,  lng: 37.62,   tier: 1 },
  // ── Middle East ───────────────────────────────────────────────────────────
  { id: "dubai",        name: "Dubai",           country: "UAE",        lat: 25.20,  lng: 55.27,   tier: 1 },
  { id: "abudhabi",     name: "Abu Dhabi",       country: "UAE",        lat: 24.47,  lng: 54.37,   tier: 2 },
  { id: "riyadh",       name: "Riyadh",          country: "Saudi Ar.", lat: 24.69,  lng: 46.72,   tier: 1 },
  { id: "doha",         name: "Doha",            country: "Qatar",      lat: 25.29,  lng: 51.53,   tier: 2 },
  { id: "telaviv",      name: "Tel Aviv",        country: "Israel",     lat: 32.08,  lng: 34.78,   tier: 2 },
  { id: "istanbul",     name: "Istanbul",        country: "Turkey",     lat: 41.01,  lng: 28.95,   tier: 1 },
  { id: "ankara",       name: "Ankara",          country: "Turkey",     lat: 39.93,  lng: 32.86,   tier: 2 },
  { id: "tehran",       name: "Tehran",          country: "Iran",       lat: 35.69,  lng: 51.42,   tier: 2 },
  // ── Africa ────────────────────────────────────────────────────────────────
  { id: "cairo",        name: "Cairo",           country: "Egypt",      lat: 30.04,  lng: 31.24,   tier: 1 },
  { id: "nairobi",      name: "Nairobi",         country: "Kenya",      lat: -1.29,  lng: 36.82,   tier: 2 },
  { id: "lagos",        name: "Lagos",           country: "Nigeria",    lat: 6.46,   lng: 3.38,    tier: 2 },
  { id: "johannesburg", name: "Johannesburg",    country: "S. Africa",  lat: -26.20, lng: 28.04,   tier: 1 },
  { id: "casablanca",   name: "Casablanca",      country: "Morocco",    lat: 33.59,  lng: -7.62,   tier: 2 },
  { id: "accra",        name: "Accra",           country: "Ghana",      lat: 5.56,   lng: -0.20,   tier: 3 },
  { id: "addisababa",   name: "Addis Ababa",     country: "Ethiopia",   lat: 9.03,   lng: 38.74,   tier: 3 },
  // ── Asia ──────────────────────────────────────────────────────────────────
  { id: "beijing",      name: "Beijing",         country: "China",      lat: 39.91,  lng: 116.39,  tier: 1 },
  { id: "shanghai",     name: "Shanghai",        country: "China",      lat: 31.23,  lng: 121.47,  tier: 1 },
  { id: "shenzhen",     name: "Shenzhen",        country: "China",      lat: 22.54,  lng: 114.06,  tier: 2 },
  { id: "hongkong",     name: "Hong Kong",       country: "China",      lat: 22.32,  lng: 114.17,  tier: 1 },
  { id: "tokyo",        name: "Tokyo",           country: "Japan",      lat: 35.68,  lng: 139.69,  tier: 1 },
  { id: "osaka",        name: "Osaka",           country: "Japan",      lat: 34.69,  lng: 135.50,  tier: 2 },
  { id: "seoul",        name: "Seoul",           country: "S. Korea",   lat: 37.57,  lng: 126.98,  tier: 1 },
  { id: "singapore",    name: "Singapore",       country: "Singapore",  lat: 1.35,   lng: 103.82,  tier: 1 },
  { id: "kualalumpur",  name: "Kuala Lumpur",    country: "Malaysia",   lat: 3.14,   lng: 101.69,  tier: 2 },
  { id: "bangkok",      name: "Bangkok",         country: "Thailand",   lat: 13.75,  lng: 100.52,  tier: 2 },
  { id: "jakarta",      name: "Jakarta",         country: "Indonesia",  lat: -6.21,  lng: 106.85,  tier: 2 },
  { id: "manila",       name: "Manila",          country: "Philippines",lat: 14.60,  lng: 120.98,  tier: 2 },
  { id: "hanoi",        name: "Hanoi",           country: "Vietnam",    lat: 21.03,  lng: 105.85,  tier: 3 },
  { id: "newdelhi",     name: "New Delhi",       country: "India",      lat: 28.61,  lng: 77.21,   tier: 1 },
  { id: "mumbai",       name: "Mumbai",          country: "India",      lat: 19.08,  lng: 72.88,   tier: 1 },
  { id: "bangalore",    name: "Bangalore",       country: "India",      lat: 12.97,  lng: 77.59,   tier: 2 },
  { id: "karachi",      name: "Karachi",         country: "Pakistan",   lat: 24.86,  lng: 67.01,   tier: 2 },
  { id: "dhaka",        name: "Dhaka",           country: "Bangladesh", lat: 23.78,  lng: 90.40,   tier: 2 },
  { id: "colombo",      name: "Colombo",         country: "Sri Lanka",  lat: 6.93,   lng: 79.84,   tier: 3 },
  { id: "ulaanbaatar",  name: "Ulaanbaatar",     country: "Mongolia",   lat: 47.91,  lng: 106.92,  tier: 3 },
  // ── Oceania ───────────────────────────────────────────────────────────────
  { id: "sydney",       name: "Sydney",          country: "Australia",  lat: -33.87, lng: 151.21,  tier: 1 },
  { id: "melbourne",    name: "Melbourne",       country: "Australia",  lat: -37.81, lng: 144.96,  tier: 2 },
  { id: "auckland",     name: "Auckland",        country: "New Zealand",lat: -36.87, lng: 174.77,  tier: 3 },
] as const;

type Capital = (typeof CAPITALS)[number];

// Dot sizes and opacities per tier
const TIER_DOT: Record<number, { size: number; opacity: number; alwaysLabel: boolean }> = {
  1: { size: 5, opacity: 0.7,  alwaysLabel: true  },
  2: { size: 3, opacity: 0.45, alwaysLabel: false },
  3: { size: 2, opacity: 0.28, alwaysLabel: false },
};

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
        const cfg = TIER_DOT[cap.tier];

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
              zIndex: isHov ? 80 : cap.tier === 1 ? 10 : 5,
            }}
          >
            {/* Diamond marker — distinct from crypto circles and stock squares */}
            <div
              style={{
                width: isHov ? cfg.size + 3 : cfg.size,
                height: isHov ? cfg.size + 3 : cfg.size,
                background: `rgba(255,255,255,${isHov ? 0.9 : cfg.opacity})`,
                borderRadius: "1px",
                transform: "rotate(45deg)",
                boxShadow: isHov ? "0 0 6px rgba(255,255,255,0.6)" : "none",
                transition: "all 0.15s",
              }}
            />

            {/* Tier-1 always-visible label */}
            {(cfg.alwaysLabel || isHov) && !isHov && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "-14px",
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  fontSize: "7px",
                  fontFamily: "var(--font-mono, monospace)",
                  color: "rgba(255,255,255,0.38)",
                  letterSpacing: "0.05em",
                  pointerEvents: "none",
                }}
              >
                {cap.name}
              </div>
            )}

            {/* Hover tooltip */}
            {isHov && (
              <div
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "-8px",
                  width: "150px",
                  background: "rgba(6,9,18,0.96)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                  pointerEvents: "none",
                  zIndex: 200,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.9)", fontFamily: "var(--font-mono, monospace)" }}>
                    {cap.name}
                  </span>
                  <span style={{ fontSize: "7px", color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-mono, monospace)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "3px", padding: "1px 4px" }}>
                    T{cap.tier}
                  </span>
                </div>
                <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-mono, monospace)", marginBottom: "4px" }}>
                  {cap.country}
                </div>
                <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-mono, monospace)" }}>
                  {cap.lat.toFixed(2)}°{cap.lat >= 0 ? "N" : "S"} · {Math.abs(cap.lng).toFixed(2)}°{cap.lng >= 0 ? "E" : "W"}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
