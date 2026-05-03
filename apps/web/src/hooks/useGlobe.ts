"use client";

import {
  EXCHANGES,
  SESSION_COLORS_HEX,
  STOCK_MARKETS,
  TWEAK_DEFAULTS,
} from "@/lib/constants";
import { getSunLatLng } from "@/lib/session-logic";
import type { GlobeMode, TweakValues } from "@sessionmap/types";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// ── Helpers ───────────────────────────────────────────────────────────────────
function latLngToVec3(lat: number, lng: number, r = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function greatCircleArc(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  peakAlt: number,
  segments = 64,
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = new THREE.Vector3().lerpVectors(p1, p2, t).normalize();
    const alt = 1 + peakAlt * Math.sin(t * Math.PI);
    pts.push(pt.multiplyScalar(alt));
  }
  return pts;
}

// ── Globe context shared with React overlay ───────────────────────────────────
interface GlobeProject {
  (lat: number, lng: number): { x: number; y: number; visible: boolean };
}

declare global {
  interface Window {
    globeProject?: GlobeProject;
    exchangeData?: typeof EXCHANGES;
    globeState?: {
      setMode: (m: GlobeMode) => void;
      mode: GlobeMode;
    };
    timeOffsetHours?: number;
    tweakPulse?: boolean;
    onWhaleArc?: (w: {
      type: string;
      amount: number;
      from: string;
      to: string;
    }) => void;
  }
}

// ── Vertex / Fragment shaders ─────────────────────────────────────────────────
const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    // Use world-space normals so sunDir (world-space) dot product is correct
    // regardless of camera orbit position. modelMatrix is identity for the
    // non-rotating globe, so mat3(modelMatrix) * normal = object-space normal
    // = world-space normal.
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  uniform bool hasTextures;
  uniform float u_declination; // solar declination in degrees (-23.45..+23.45)
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 S = normalize(sunDir);
    float d = dot(N, S);

    float dayBlend   = smoothstep(-0.05, 0.15, d);
    float nightBlend = smoothstep(0.08, -0.08, d);

    // Seasonal calculations (used to modulate polar whiteness and tint)
    // vUv.y: 0=south pole, 1=north pole. lat_frac: -1..+1
    float lat_frac = (vUv.y - 0.5) * 2.0;              // -1(S) .. +1(N)
    float dec_norm  = u_declination / 23.45;           // -1..+1 (neg=SH summer)
    // seasonal: +1 where it's summer on this hemisphere, -1 where it's winter
    float seasonal  = lat_frac * dec_norm;             // +1 summer side, -1 winter side
    // winterFactor: 1.0 on winter side, 0.0 on summer side
    float winterFactor = clamp(-seasonal, 0.0, 1.0);

    vec4 day, night;
    if (hasTextures) {
      day   = texture2D(dayTex,   vUv);
      night = texture2D(nightTex, vUv);
      night.rgb = night.rgb * 2.8 * nightBlend;
    } else {
      float lng = (vUv.x - 0.5) * 6.28318;
      float lat = (vUv.y - 0.5) * 3.14159;
      float land  = sin(lng * 1.8) * cos(lat * 2.2) * 0.5
                  + sin(lng * 3.1 + 0.9) * cos(lat * 1.4 + 0.5) * 0.35
                  + sin(lng * 0.9 - 1.2) * cos(lat * 3.0 - 0.3) * 0.25;
      land = smoothstep(0.18, 0.42, land);
      float polar = smoothstep(0.75, 0.95, abs(vUv.y * 2.0 - 1.0));
      vec3 dayRGB = mix(vec3(0.04, 0.16, 0.42), vec3(0.14, 0.30, 0.12), land);
      // Modulate polar whiteness by winterFactor so summer hemisphere shows less snow
      // baseline keeps a small polar tint even in summer (0.15), winterFactor scales up to full
      dayRGB = mix(dayRGB, vec3(0.75, 0.83, 0.88), polar * (0.15 + 0.85 * winterFactor));
      day   = vec4(dayRGB, 1.0);
      night = vec4(mix(vec3(0.01, 0.03, 0.10), vec3(0.22, 0.18, 0.04), land) * nightBlend * 2.0, 1.0);
    }

    vec3 col = mix(night.rgb, day.rgb, dayBlend);
    float termGlow = exp(-abs(d) * 12.0) * 0.22;
    col = mix(col, vec3(0.85, 0.42, 0.12), termGlow * (1.0 - dayBlend * 0.7));
    col += (1.0 - nightBlend) * (1.0 - dayBlend) * 0.012;

    // Subtle season tint: warm in summer hemisphere, cool in winter hemisphere.
    float warmTint  = clamp(seasonal, 0.0, 1.0) * 0.055 * dayBlend;
    float coolTint  = clamp(-seasonal, 0.0, 1.0) * 0.04 * dayBlend;
    col += vec3(warmTint * 0.9, warmTint * 0.4, 0.0);   // warm amber in summer hemi
    col -= vec3(coolTint * 0.1, coolTint * 0.1, 0.0);   // very subtle desaturate in winter

    gl_FragColor = vec4(col, 1.0);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 cameraWorldPos;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    // Rim: angle between surface normal and direction to camera (world-space)
    vec3 toCamera = normalize(cameraWorldPos - vWorldPos);
    float rim = 1.0 - abs(dot(vNormal, toCamera));
    rim = pow(rim, 2.8);
    float day = clamp(dot(normalize(vNormal), normalize(sunDir)) * 1.5 + 0.5, 0.0, 1.0);
    vec3 dayColor   = vec3(0.25, 0.55, 0.95);
    vec3 nightColor = vec3(0.05, 0.08, 0.22);
    vec3 col = mix(nightColor, dayColor, day);
    gl_FragColor = vec4(col * rim, rim * 0.75);
  }
`;

// ── OrbitControls import shim ─────────────────────────────────────────────────
// We import from the three/examples module directly to allow tree-shaking
async function loadOrbitControls() {
  const { OrbitControls } =
    await import("three/examples/jsm/controls/OrbitControls.js");
  return OrbitControls;
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export interface UseGlobeOptions {
  mode: GlobeMode;
  tweaks: TweakValues;
  onWhaleArc?: (w: {
    type: string;
    amount: number;
    from: string;
    to: string;
  }) => void;
}

export function useGlobe(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: UseGlobeOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    let mounted = true;

    (async () => {
      const OrbitControls = await loadOrbitControls();
      if (!mounted) return;

      // ── Renderer ──────────────────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        42,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
      );
      camera.position.set(0, 0, 2.8);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 1.5;
      controls.maxDistance = 6;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;

      // ── Starfield ─────────────────────────────────────────────────────────
      const starPos = new Float32Array(3000 * 3);
      for (let i = 0; i < starPos.length; i++)
        starPos[i] = (Math.random() - 0.5) * 600;
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      scene.add(
        new THREE.Points(
          starGeo,
          new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.2,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.6,
          }),
        ),
      );

      // ── Earth uniforms ────────────────────────────────────────────────────
      const uniforms = {
        dayTex: { value: null as THREE.Texture | null },
        nightTex: { value: null as THREE.Texture | null },
        sunDir: { value: new THREE.Vector3(1, 0.2, 0.3).normalize() },
        hasTextures: { value: false },
        u_declination: { value: 0.0 },
      };

      const globeMesh = new THREE.Mesh(
        // increase segments to reduce visible texelation when sampling night textures
        new THREE.SphereGeometry(1, 256, 256),
        new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms,
        }),
      );
      scene.add(globeMesh);

      // ── Texture loading ───────────────────────────────────────────────────
      const loader = new THREE.TextureLoader();
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      // Texture priority:
      //   day  → local topo (run `pnpm dl-textures` to download) → local blue marble → CDN topo → CDN blue marble
      //   night → local 4K city lights → CDN 4K → CDN standard
      const dayURLs = [
        "/textures/earth-topo-4k.jpg", // preferred: NASA topo+bathy (political colors, terrain, oceans)
        "/textures/earth-day-4k.jpg", // fallback: existing blue marble
        "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg",
        "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg",
      ];
      const nightURLs = [
        "/textures/earth-night-4k.jpg",
        "https://unpkg.com/three-globe@2.31.1/example/img/earth-night-4k.jpg",
        "https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-night-4k.jpg",
        "https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg",
      ];

      let dayLoaded = false,
        nightLoaded = false;
      function checkTextures() {
        if (dayLoaded && nightLoaded) uniforms.hasTextures.value = true;
      }

      function tryLoad(
        urls: string[],
        uniform: { value: THREE.Texture | null },
        onDone: () => void,
      ) {
        if (!urls.length) {
          onDone();
          return;
        }
        loader.load(
          urls[0],
          (t) => {
            // Ensure textures are power-of-two so mipmaps can be generated.
            // If not, draw into a power-of-two canvas and create a CanvasTexture.
            const img = t.image as HTMLImageElement | HTMLCanvasElement | null;
            const isPOT = (n: number) => (n & (n - 1)) === 0;

            let tex: THREE.Texture = t;
            if (img && typeof (img as HTMLImageElement).width === "number") {
              const w = (img as HTMLImageElement).width;
              const h = (img as HTMLImageElement).height;
              if (!isPOT(w) || !isPOT(h)) {
                // choose next power-of-two >= original size to preserve detail
                const nextPow2 = (n: number) =>
                  Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
                const nw = Math.min(8192, nextPow2(w));
                const nh = Math.min(8192, nextPow2(h));
                try {
                  const canvas = document.createElement("canvas");
                  canvas.width = nw;
                  canvas.height = nh;
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    // draw into canvas with smoothing enabled
                    ctx.imageSmoothingEnabled = true;
                    ctx.drawImage(img as CanvasImageSource, 0, 0, nw, nh);
                    const canvasTex = new THREE.CanvasTexture(canvas);
                    canvasTex.anisotropy = maxAnisotropy;
                    canvasTex.minFilter = THREE.LinearMipmapLinearFilter;
                    canvasTex.magFilter = THREE.LinearFilter;
                    canvasTex.generateMipmaps = true;
                    canvasTex.needsUpdate = true;
                    tex = canvasTex;
                  }
                } catch (e) {
                  // fallback to original texture on any error
                  tex = t;
                }
              }
            }
            // Anisotropic filtering eliminates pixelation at oblique angles (equator)
            tex.anisotropy = maxAnisotropy;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            uniform.value = tex;
            onDone();
          },
          undefined,
          () => tryLoad(urls.slice(1), uniform, onDone),
        );
      }
      tryLoad(dayURLs, uniforms.dayTex, () => {
        dayLoaded = true;
        checkTextures();
      });
      tryLoad(nightURLs, uniforms.nightTex, () => {
        nightLoaded = true;
        checkTextures();
      });

      // ── Atmosphere ────────────────────────────────────────────────────────
      const atmoUniforms = {
        sunDir: uniforms.sunDir, // shared reference — same vec3 object
        cameraWorldPos: { value: camera.position.clone() },
      };
      scene.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(1.06, 64, 64),
          new THREE.ShaderMaterial({
            vertexShader: ATMO_VERT,
            fragmentShader: ATMO_FRAG,
            uniforms: atmoUniforms,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      );

      // ── Terminator ring ───────────────────────────────────────────────────
      const TERM_SEGS = 256;
      const termPositions = new Float32Array((TERM_SEGS + 1) * 3);
      const termGeo = new THREE.BufferGeometry();
      termGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(termPositions, 3),
      );
      const termLine = new THREE.Line(
        termGeo,
        new THREE.LineBasicMaterial({
          color: 0xffa040,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      scene.add(termLine);

      function updateTerminator(sunDir: THREE.Vector3) {
        const u = new THREE.Vector3();
        const v = new THREE.Vector3();
        const up =
          Math.abs(sunDir.y) < 0.99
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
        u.crossVectors(sunDir, up).normalize();
        v.crossVectors(sunDir, u).normalize();
        const R = 1.014;
        const pos = termGeo.attributes["position"].array as Float32Array;
        for (let i = 0; i <= TERM_SEGS; i++) {
          const a = (i / TERM_SEGS) * Math.PI * 2;
          pos[i * 3 + 0] = (Math.cos(a) * u.x + Math.sin(a) * v.x) * R;
          pos[i * 3 + 1] = (Math.cos(a) * u.y + Math.sin(a) * v.y) * R;
          pos[i * 3 + 2] = (Math.cos(a) * u.z + Math.sin(a) * v.z) * R;
        }
        termGeo.attributes["position"].needsUpdate = true;
      }

      // ── Sun marker ────────────────────────────────────────────────────────
      const sunMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd060 }),
      );
      const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xffaa20,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
        }),
      );
      scene.add(sunMarker, sunGlow);

      // ── Country borders (political map) ──────────────────────────────────
      const borderGroup = new THREE.Group();
      scene.add(borderGroup);

      interface TopoJSON {
        transform: { scale: [number, number]; translate: [number, number] };
        arcs: number[][][];
      }
      fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
        .then((r) => r.json())
        .then((topo: TopoJSON) => {
          if (!mounted) return; // Component unmounted before fetch resolved — skip
          const { scale, translate } = topo.transform;
          const pts: THREE.Vector3[] = [];
          for (const arc of topo.arcs) {
            let x = 0,
              y = 0;
            const coords: [number, number][] = arc.map(([dx, dy]) => {
              x += dx;
              y += dy;
              return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
            });
            for (let i = 0; i < coords.length - 1; i++) {
              pts.push(
                // Slightly raised (1.004) so depth buffer reliably shows above globe
                latLngToVec3(coords[i][1], coords[i][0], 1.004),
                latLngToVec3(coords[i + 1][1], coords[i + 1][0], 1.004),
              );
            }
          }
          borderGroup.add(
            new THREE.LineSegments(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({
                color: 0x6699bb, // muted steel-blue — political map style
                transparent: true,
                opacity: 0.35,
                depthWrite: false,
                depthTest: true,
              }),
            ),
          );
        })
        .catch(() => {}); // Gracefully skip if CDN unreachable

      // ── Rivers (Natural Earth 50m) ────────────────────────────────────────
      interface RiversGeoJSON {
        features: Array<{
          geometry: {
            type: "LineString" | "MultiLineString";
            coordinates: number[][] | number[][][];
          };
        }>;
      }
      const riverGroup = new THREE.Group();
      scene.add(riverGroup);

      fetch(
        "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_rivers_lake_centerlines.geojson",
      )
        .then((r) => r.json())
        .then((geo: RiversGeoJSON) => {
          if (!mounted) return;
          const pts: THREE.Vector3[] = [];
          for (const feature of geo.features) {
            const { type, coordinates } = feature.geometry;
            const lines: number[][][] =
              type === "MultiLineString"
                ? (coordinates as number[][][])
                : [coordinates as number[][]];
            for (const line of lines) {
              for (let i = 0; i < line.length - 1; i++) {
                pts.push(
                  // slightly above globe so rivers appear on top of texture
                  latLngToVec3(line[i][1], line[i][0], 1.003),
                  latLngToVec3(line[i + 1][1], line[i + 1][0], 1.003),
                );
              }
            }
          }
          riverGroup.add(
            new THREE.LineSegments(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({
                color: 0x3a8fc8, // blue rivers
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                depthTest: true,
              }),
            ),
          );
        })
        .catch(() => {}); // Gracefully skip if CDN unreachable

      // ── Major railways (Natural Earth 10m simplified) ─────────────────────
      interface RailGeoJSON {
        features: Array<{
          geometry: {
            type: "LineString" | "MultiLineString";
            coordinates: number[][] | number[][][];
          };
        }>;
      }
      const railGroup = new THREE.Group();
      scene.add(railGroup);

      fetch(
        "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_10m_railroads.geojson",
      )
        .then((r) => r.json())
        .then((geo: RailGeoJSON) => {
          if (!mounted) return;
          const pts: THREE.Vector3[] = [];
          for (const feature of geo.features) {
            const { type, coordinates } = feature.geometry;
            const lines: number[][][] =
              type === "MultiLineString"
                ? (coordinates as number[][][])
                : [coordinates as number[][]];
            for (const line of lines) {
              for (let i = 0; i < line.length - 1; i++) {
                pts.push(
                  latLngToVec3(line[i][1], line[i][0], 1.002),
                  latLngToVec3(line[i + 1][1], line[i + 1][0], 1.002),
                );
              }
            }
          }
          railGroup.add(
            new THREE.LineSegments(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({
                color: 0xb06020, // warm brown — railway colour convention
                transparent: true,
                opacity: 0.35,
                depthWrite: false,
                depthTest: true,
              }),
            ),
          );
        })
        .catch(() => {}); // 10m data is large — silently skip if too slow

      // ── Major shipping / trade routes ─────────────────────────────────────
      const TRADE_LANES: Array<{ waypoints: [number, number][] }> = [
        // Trans-Pacific: Los Angeles → Yokohama
        {
          waypoints: [
            [33.7, -118.2],
            [35, -152],
            [35.5, 139.6],
          ],
        },
        // Asia-Europe via Suez: Shanghai → Rotterdam
        {
          waypoints: [
            [31.2, 121.5],
            [1.3, 103.8],
            [12.8, 43.1],
            [29.9, 32.5],
            [36.8, 10.0],
            [37.9, 23.7],
            [41.0, 28.9],
            [51.9, 4.5],
          ],
        },
        // Trans-Atlantic: New York → Southampton
        {
          waypoints: [
            [40.7, -74.0],
            [47.0, -38.0],
            [50.9, -1.4],
          ],
        },
        // Cape route: Shanghai → Rotterdam around Africa
        {
          waypoints: [
            [31.2, 121.5],
            [-6.0, 39.6],
            [-34.4, 18.5],
            [5.0, -8.0],
            [51.9, 4.5],
          ],
        },
        // Indian Ocean: Singapore → Mumbai → Gulf of Aden
        {
          waypoints: [
            [1.3, 103.8],
            [8.0, 78.0],
            [19.1, 72.9],
            [12.8, 43.1],
          ],
        },
        // Trans-Pacific South: Sydney → Los Angeles
        {
          waypoints: [
            [-33.9, 151.2],
            [-18.0, -155.0],
            [33.7, -118.2],
          ],
        },
        // Americas: Buenos Aires → New York
        {
          waypoints: [
            [-34.6, -58.4],
            [10.5, -66.9],
            [40.7, -74.0],
          ],
        },
      ];

      const tradeGroup = new THREE.Group();
      scene.add(tradeGroup);
      const tradeMaterials: THREE.LineDashedMaterial[] = [];

      TRADE_LANES.forEach((lane) => {
        const pts: THREE.Vector3[] = [];
        for (let s = 0; s < lane.waypoints.length - 1; s++) {
          const [lat1, lng1] = lane.waypoints[s];
          const [lat2, lng2] = lane.waypoints[s + 1];
          const p1 = latLngToVec3(lat1, lng1, 1);
          const p2 = latLngToVec3(lat2, lng2, 1);
          pts.push(...greatCircleArc(p1, p2, 0.0, 40));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineDashedMaterial({
          color: 0xc8972a,
          transparent: true,
          opacity: 0.38,
          dashSize: 0.035,
          gapSize: 0.018,
          depthWrite: false,
        });
        const tradeLine = new THREE.Line(geo, mat);
        (
          tradeLine as unknown as { computeLineDistances: () => void }
        ).computeLineDistances();
        tradeGroup.add(tradeLine);
        tradeMaterials.push(mat);
      });

      // ── Stock market 3D markers (squares, higher orbit than crypto circles) ─
      const stockGroup = new THREE.Group();
      scene.add(stockGroup);
      const stockMeshes: { mesh: THREE.Mesh; phase: number }[] = [];

      STOCK_MARKETS.forEach((market) => {
        const pos = latLngToVec3(market.lat, market.lng, 1.017);
        const col = new THREE.Color(market.color);
        const sq = new THREE.Mesh(
          new THREE.PlaneGeometry(0.02, 0.02),
          new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }),
        );
        // Outer square ring
        const sqRing = new THREE.Mesh(
          new THREE.PlaneGeometry(0.036, 0.036),
          new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        sq.position.copy(pos);
        sqRing.position.copy(pos);
        stockGroup.add(sq, sqRing);
        stockMeshes.push({ mesh: sq, phase: Math.random() * Math.PI * 2 });
        stockMeshes.push({ mesh: sqRing, phase: Math.random() * Math.PI * 2 });
      });

      // ── Exchange markers ──────────────────────────────────────────────────
      const markerGroup = new THREE.Group();
      scene.add(markerGroup);
      const markerMeshes: {
        dot: THREE.Mesh;
        ring: THREE.Mesh;
        phase: number;
        ex: (typeof EXCHANGES)[0];
      }[] = [];

      EXCHANGES.forEach((ex) => {
        const pos = latLngToVec3(ex.lat, ex.lng, 1.013);
        const r = 0.007 + Math.log(ex.vol + 1) * 0.003;
        const col = new THREE.Color(SESSION_COLORS_HEX[ex.region]);

        // Flat disk facing camera (billboard)
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(r, 16),
          new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }),
        );
        // Flat ring facing camera (billboard)
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.8, r * 2.6, 24),
          new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        dot.position.copy(pos);
        ring.position.copy(pos);
        markerGroup.add(dot, ring);
        markerMeshes.push({
          dot,
          ring,
          phase: Math.random() * Math.PI * 2,
          ex,
        });
      });

      // ── Globe projection (shared with React overlay) ───────────────────
      window.exchangeData = EXCHANGES;
      window.globeProject = (lat: number, lng: number) => {
        const pos = latLngToVec3(lat, lng, 1.0);
        const camDir = camera.position.clone().normalize();
        const facing = pos.dot(camDir);
        const v = pos.clone().project(camera);
        return {
          x: ((v.x + 1) / 2) * window.innerWidth,
          y: ((-v.y + 1) / 2) * window.innerHeight,
          visible: facing > 0.15,
        };
      };

      window.globeState = {
        mode: optionsRef.current.mode,
        setMode: (m: GlobeMode) => {
          optionsRef.current = { ...optionsRef.current, mode: m };
          if (m === "auto") {
            controls.autoRotate = true;
            controls.enabled = true;
          } else {
            controls.autoRotate = false;
            controls.enabled = true;
          }
        },
      };

      // ── Whale arc system ──────────────────────────────────────────────────
      interface ArcEntry {
        line: THREE.Line;
        dotMesh: THREE.Mesh;
        glowMesh: THREE.Mesh;
        tail: THREE.Line;
        tailMat: THREE.LineBasicMaterial;
        lineMat: THREE.LineBasicMaterial;
        arcPts: THREE.Vector3[];
        progress: number;
        born: number;
        lifetime: number;
        amountBTC: number;
      }

      const WHALE_COLORS: Record<string, THREE.Color> = {
        transfer: new THREE.Color(0xfbbf24),
        deposit: new THREE.Color(0x7dd3fc),
        withdraw: new THREE.Color(0xf472b6),
        dex: new THREE.Color(0x34d399),
      };

      const whaleGroup = new THREE.Group();
      scene.add(whaleGroup);
      const activeArcs: ArcEntry[] = [];

      function spawnWhaleArc(whale?: {
        type: string;
        amount: number;
        from: string;
        to: string;
      }) {
        const exList = EXCHANGES;
        let i1 = Math.floor(Math.random() * exList.length);
        let i2 = Math.floor(Math.random() * (exList.length - 1));
        if (i2 >= i1) i2++;

        const ex1 = exList[i1];
        const ex2 = exList[i2];
        const p1 = latLngToVec3(ex1.lat, ex1.lng, 1);
        const p2 = latLngToVec3(ex2.lat, ex2.lng, 1);
        const dist = p1.distanceTo(p2);
        const peakAlt = 0.08 + dist * 0.14;
        const arcPts = greatCircleArc(p1, p2, peakAlt);

        const type = whale?.type ?? "transfer";
        const amountBTC =
          whale?.amount ?? Math.floor(Math.random() * 4500 + 200);
        const col = WHALE_COLORS[type] ?? WHALE_COLORS.transfer;
        const lineOpacity = 0.15 + Math.min(amountBTC / 5000, 1) * 0.35;

        const lineMat = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: lineOpacity,
          depthWrite: false,
        });
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(arcPts),
          lineMat,
        );
        whaleGroup.add(line);

        const dotSize = 0.009 + Math.min(amountBTC / 5000, 1) * 0.016;
        const dotMesh = new THREE.Mesh(
          new THREE.SphereGeometry(dotSize, 8, 8),
          new THREE.MeshBasicMaterial({ color: col, depthWrite: false }),
        );
        const glowMesh = new THREE.Mesh(
          new THREE.SphereGeometry(dotSize * 2.5, 8, 8),
          new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
          }),
        );
        whaleGroup.add(dotMesh, glowMesh);

        const tailMat = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const tail = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([arcPts[0], arcPts[0]]),
          tailMat,
        );
        whaleGroup.add(tail);

        activeArcs.push({
          line,
          dotMesh,
          glowMesh,
          tail,
          tailMat,
          lineMat,
          arcPts,
          progress: 0,
          born: elapsed,
          lifetime: 5.5,
          amountBTC,
        });
      }

      function updateWhaleArcs() {
        const TAIL_SEGS = 12;
        for (let i = activeArcs.length - 1; i >= 0; i--) {
          const arc = activeArcs[i];
          const age = elapsed - arc.born;
          const lifeRatio = age / arc.lifetime;

          if (lifeRatio >= 1) {
            whaleGroup.remove(arc.line, arc.dotMesh, arc.glowMesh, arc.tail);
            arc.line.geometry.dispose();
            arc.lineMat.dispose();
            arc.tail.geometry.dispose();
            arc.tailMat.dispose();
            (arc.dotMesh.material as THREE.Material).dispose();
            (arc.glowMesh.material as THREE.Material).dispose();
            activeArcs.splice(i, 1);
            continue;
          }

          const t = lifeRatio;
          arc.progress = t < 0.85 ? t / 0.85 : 1;
          const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
          arc.lineMat.opacity =
            (0.12 + Math.min(arc.amountBTC / 5000, 1) * 0.3) * alpha;
          arc.tailMat.opacity = 0.7 * alpha;
          (arc.dotMesh.material as THREE.MeshBasicMaterial).opacity = alpha;
          (arc.glowMesh.material as THREE.MeshBasicMaterial).opacity =
            0.25 * alpha;

          const idx = Math.floor(arc.progress * (arc.arcPts.length - 1));
          arc.dotMesh.position.copy(arc.arcPts[idx]);
          arc.glowMesh.position.copy(arc.arcPts[idx]);

          const tailStart = Math.max(0, idx - TAIL_SEGS);
          const tailPts = arc.arcPts.slice(tailStart, idx + 1);
          if (tailPts.length > 1) arc.tail.geometry.setFromPoints(tailPts);
        }
      }

      // Expose spawn to outside world (for WS whale events)
      window.onWhaleArc = (w) => spawnWhaleArc(w);

      // ── Animation loop ────────────────────────────────────────────────────
      let elapsed = 0;
      const clock = new THREE.Clock();
      let nextSpawn = 3;

      function animate() {
        if (!mounted) return;
        animId = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        elapsed += dt;

        const { tweaks, mode } = optionsRef.current;
        const timeOffset = tweaks.timeOffset ?? 0;
        const simDate = new Date(Date.now() + timeOffset * 3_600_000);
        const sunLL = getSunLatLng(simDate);
        const sunVec = latLngToVec3(sunLL.lat, sunLL.lng, 1).normalize();
        // sunDir stays world-space — normals in both shaders are now world-space too
        uniforms.sunDir.value.copy(sunVec);
        uniforms.u_declination.value = sunLL.lat;
        // Keep atmosphere camera position in sync
        atmoUniforms.cameraWorldPos.value.copy(camera.position);

        if (tweaks.showTerminator) {
          updateTerminator(sunVec);
          termLine.visible = true;
        } else {
          termLine.visible = false;
        }

        if (tweaks.showSunMarker) {
          const sunPos = latLngToVec3(sunLL.lat, sunLL.lng, 1.025);
          sunMarker.position.copy(sunPos);
          sunGlow.position.copy(sunPos);
          sunMarker.visible = true;
          sunGlow.visible = true;
          const pulse = 1 + 0.2 * Math.sin(elapsed * 2.5);
          sunGlow.scale.setScalar(pulse);
        } else {
          sunMarker.visible = false;
          sunGlow.visible = false;
        }

        if (mode === "follow") {
          const dist = camera.position.length();
          const followTarget = sunVec.clone().multiplyScalar(dist);
          camera.position.lerp(followTarget, 0.005);
          camera.position.setLength(dist);
        }

        const speed =
          ((tweaks.rotationSpeed ?? TWEAK_DEFAULTS.rotationSpeed) / 50) * 0.6;
        controls.autoRotateSpeed = speed;
        controls.autoRotate = mode === "auto";

        markerMeshes.forEach((m) => {
          // Billboard — always face camera
          m.dot.quaternion.copy(camera.quaternion);
          m.ring.quaternion.copy(camera.quaternion);

          if (!tweaks.markerPulse) {
            (m.ring.material as THREE.MeshBasicMaterial).opacity = 0;
            return;
          }
          const s = 1 + 0.5 * Math.sin(elapsed * 1.4 + m.phase);
          m.ring.scale.setScalar(s);
          (m.ring.material as THREE.MeshBasicMaterial).opacity =
            0.35 * (2.2 - s) * 0.5;
        });

        // Billboard stock market squares
        stockMeshes.forEach((m) => {
          m.mesh.quaternion.copy(camera.quaternion);
        });

        // Animate trade route dash flow (golden ant march effect)
        tradeMaterials.forEach((mat) => {
          (
            mat as THREE.LineDashedMaterial & { dashOffset: number }
          ).dashOffset -= dt * 0.04;
        });

        // auto-spawn arcs when no WS (fallback mode)
        nextSpawn -= dt;
        if (nextSpawn <= 0) {
          spawnWhaleArc();
          nextSpawn = 3 + Math.random() * 4;
        }

        updateWhaleArcs();
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // ── Resize ────────────────────────────────────────────────────────────
      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      // ── Cleanup ───────────────────────────────────────────────────────────
      return () => {
        mounted = false;
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        tradeMaterials.forEach((m) => m.dispose());
        delete window.globeProject;
        delete window.globeState;
        delete window.onWhaleArc;
      };
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(animId);
    };
  }, [canvasRef]);
}
