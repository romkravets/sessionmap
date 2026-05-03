"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EXCHANGES, SESSION_COLORS_HEX, TWEAK_DEFAULTS } from "@/lib/constants";
import { getSunLatLng } from "@/lib/session-logic";
import type { GlobeMode, WhaleEvent, TweakValues } from "@sessionmap/types";

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
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 S = normalize(sunDir);
    float d = dot(N, S);

    float dayBlend   = smoothstep(-0.05, 0.15, d);
    float nightBlend = smoothstep(0.08, -0.08, d);

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
      dayRGB = mix(dayRGB, vec3(0.75, 0.83, 0.88), polar);
      day   = vec4(dayRGB, 1.0);
      night = vec4(mix(vec3(0.01, 0.03, 0.10), vec3(0.22, 0.18, 0.04), land) * nightBlend * 2.0, 1.0);
    }

    vec3 col = mix(night.rgb, day.rgb, dayBlend);
    float termGlow = exp(-abs(d) * 12.0) * 0.22;
    col = mix(col, vec3(0.85, 0.42, 0.12), termGlow * (1.0 - dayBlend * 0.7));
    col += (1.0 - nightBlend) * (1.0 - dayBlend) * 0.012;
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
      };

      const globeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 72, 72),
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
      const dayURLs = [
        "https://unpkg.com/three-globe@2.34.1/example/img/earth-blue-marble.jpg",  // newer version, higher quality
        "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg",
        "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg",
      ];
      const nightURLs = [
        "https://unpkg.com/three-globe@2.34.1/example/img/earth-night.jpg",
        "https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg",
        "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_lights_2048.png",
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
            // Anisotropic filtering eliminates pixelation at oblique angles (equator)
            t.anisotropy = maxAnisotropy;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            uniform.value = t;
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
        markerMeshes.push({ dot, ring, phase: Math.random() * Math.PI * 2, ex });
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
