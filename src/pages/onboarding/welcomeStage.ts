import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp01, disposeTree, easeOutBack, easeOutCubic, paint, pen, shadePool } from './stageKit';

/**
 * The welcome screen's scene: a phone showing a booking page, and the three
 * things the questions are about (the business, what it offers, a booking)
 * coming out of it as cards. Plays its entrance once, then floats.
 */

export interface SceneText {
  business: string;
  tagline: string;
  pickService: string;
  services: [string, string][];
  pickTime: string;
  slots: string[];
  service: string;
  duration: string;
  booked: string;
  bookedWhen: string;
  cta: string;
}

export interface WelcomeScene {
  /** Lift one card toward the viewer (the step being pointed at), or none. */
  focus(i: number | null): void;
  dispose(): void;
}

interface Opts {
  text: SceneText;
  rtl: boolean;
  accent: string;
  font: string;
  reducedMotion: boolean;
}

export function createWelcomeScene(host: HTMLElement, o: Opts): WelcomeScene {
  const { text, rtl, accent, font } = o;
  const tint = new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.9).getStyle();
  const ink = '#1c1c1e';
  const muted = '#8a8a8e';
  const line = '#ecebe8';
  const { X, label, rect } = pen(rtl, font);

  // ── Textures ──────────────────────────────────────────────────────
  const SW = 300;
  const SH = 620;
  const screenTex = paint(SW, SH, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SW, SH);
    rect(g, SW, 0, 0, SW, 150, 0, tint);
    g.fillStyle = accent;
    g.beginPath();
    g.arc(X(SW, 46), 92, 24, 0, Math.PI * 2);
    g.fill();
    label(g, text.business, 80, 84, 17, ink, 700, SW);
    label(g, text.tagline, 80, 106, 12, muted, 500, SW);
    label(g, text.pickService, 22, 186, 14, ink, 650, SW);
    text.services.forEach(([name, meta], i) => {
      const y = 206 + i * 62;
      rect(g, SW, 22, y, SW - 44, 52, 12, i === 0 ? tint : '#f6f6f4');
      if (i === 0) {
        g.strokeStyle = accent;
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(X(SW, 22, SW - 44), y, SW - 44, 52, 12);
        g.stroke();
      }
      label(g, name, 38, y + 19, 13, ink, 600, SW);
      label(g, meta, 38, y + 36, 11, muted, 500, SW);
    });
    label(g, text.pickTime, 22, 418, 14, ink, 650, SW);
    text.slots.slice(0, 6).forEach((s, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const w = (SW - 44 - 16) / 3;
      const x = 22 + col * (w + 8);
      const y = 438 + row * 44;
      rect(g, SW, x, y, w, 36, 10, i === 1 ? accent : '#f6f6f4');
      g.font = `600 12px ${font}`;
      g.fillStyle = i === 1 ? '#ffffff' : ink;
      g.textAlign = 'center';
      g.direction = 'ltr';
      g.fillText(s, X(SW, x, w) + w / 2, y + 19);
    });
    rect(g, SW, 22, 548, SW - 44, 46, 23, accent);
    g.font = `650 14px ${font}`;
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.direction = rtl ? 'rtl' : 'ltr';
    g.fillText(text.cta, SW / 2, 572);
  });

  const card = (w: number, h: number, bg: string, draw: (g: CanvasRenderingContext2D) => void) =>
    paint(w, h, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      draw(g);
    });

  const businessTex = card(330, 124, '#ffffff', (g) => {
    g.fillStyle = accent;
    g.beginPath();
    g.arc(X(330, 58), 62, 34, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    for (const dy of [-10, 0, 10]) {
      g.moveTo(X(330, 44), 62 + dy);
      g.lineTo(X(330, dy === 0 ? 72 : 66), 62 + dy);
    }
    g.stroke();
    label(g, text.business, 110, 52, 21, ink, 700, 330);
    label(g, text.tagline, 110, 80, 14, muted, 500, 330);
  });

  const serviceTex = card(340, 180, '#ffffff', (g) => {
    label(g, text.service, 24, 34, 18, ink, 700, 340);
    label(g, text.duration, 24, 60, 13, muted, 500, 340);
    rect(g, 340, 24, 80, 292, 1, 0, line);
    text.slots.slice(0, 3).forEach((s, i) => {
      const w = 88;
      const x = 24 + i * (w + 14);
      rect(g, 340, x, 100, w, 52, 14, i === 1 ? accent : '#f3f3f1');
      g.font = `650 16px ${font}`;
      g.fillStyle = i === 1 ? '#ffffff' : ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.direction = 'ltr';
      g.fillText(s, X(340, x, w) + w / 2, 127);
    });
  });

  const bookedTex = card(300, 110, accent, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(X(300, 52), 55, 28, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    const cx = X(300, 52);
    g.moveTo(cx - 11, 56);
    g.lineTo(cx - 3, 64);
    g.lineTo(cx + 12, 47);
    g.stroke();
    label(g, text.booked, 96, 44, 20, '#ffffff', 700, 300);
    label(g, text.bookedWhen, 96, 70, 14, 'rgba(255,255,255,0.78)', 500, 300);
  });

  // ── Scene ─────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  const key = new THREE.DirectionalLight('#fff6ec', 2.2);
  key.position.set(rtl ? -2.5 : 2.5, 4, 3.5);
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#d9dedc', 0.9));

  const shade = shadePool(1.9, 1.1);
  shade.position.y = -1.0;
  scene.add(shade);

  const rig = new THREE.Group();
  scene.add(rig);

  const body = new THREE.MeshPhysicalMaterial({ color: '#232326', roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
  const paper = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const brand = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const face = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, toneMapped: false });

  // Phone
  const PW = 0.8;
  const PH = 1.62;
  const phone = new THREE.Group();
  const shell = new THREE.Mesh(new RoundedBoxGeometry(PW, PH, 0.08, 6, 0.1), body);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.06, PH - 0.06), face(screenTex));
  glass.position.z = 0.0405;
  const island = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.05, 0.004, 3, 0.02), body);
  island.position.set(0, PH / 2 - 0.08, 0.043);
  phone.add(shell, glass, island);
  rig.add(phone);

  // Cards: [texture, width, height, material, resting place, phase]
  const side = rtl ? -1 : 1;
  const specs: { tex: THREE.Texture; w: number; h: number; mat: THREE.Material; at: [number, number, number]; tilt: number }[] = [
    { tex: businessTex, w: 0.95, h: 0.357, mat: paper, at: [side * 0.78, 0.62, 0.42], tilt: -0.05 },
    { tex: serviceTex, w: 0.98, h: 0.519, mat: paper, at: [-side * 0.8, -0.02, 0.36], tilt: 0.04 },
    { tex: bookedTex, w: 0.86, h: 0.315, mat: brand, at: [side * 0.66, -0.66, 0.55], tilt: -0.03 },
  ];
  const cards = specs.map((s, i) => {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new RoundedBoxGeometry(s.w, s.h, 0.03, 4, 0.035), s.mat);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 0.05, s.h - 0.05), face(s.tex));
    front.position.z = 0.0155;
    g.add(slab, front);
    rig.add(g);
    return { g, s, phase: i * 2.1, lift: 0 };
  });

  // ── Motion ────────────────────────────────────────────────────────
  let focused: number | null = null;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    pointer.tx = clamp01((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = clamp01((e.clientY - r.top) / r.height) * 2 - 1;
  };
  if (!o.reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  const start = performance.now();
  const intro = o.reducedMotion ? 0 : 1;

  function pose(now: number) {
    const t = (now - start) / 1000;
    const k = intro ? t : 99;
    const p = easeOutCubic(clamp01(k / 1.1));
    phone.position.set(0, -0.3 * (1 - p) + (o.reducedMotion ? 0 : Math.sin(t * 0.7) * 0.02), 0);
    phone.rotation.set(0.04, side * (-0.32 - 0.6 * (1 - p)), 0);
    shade.material.opacity = p * (1 - phone.position.y * 1.5);

    cards.forEach((c, i) => {
      const q = clamp01((k - 0.45 - i * 0.18) / 0.9);
      const e = easeOutBack(q);
      const [x, y, z] = c.s.at;
      c.lift += ((focused === i ? 1 : 0) - c.lift) * 0.12;
      const bob = o.reducedMotion ? 0 : Math.sin(t * 0.9 + c.phase) * 0.028;
      c.g.position.set(x * e, y * e + bob + c.lift * 0.04, 0.05 + (z - 0.05) * e + c.lift * 0.22);
      const sc = (0.35 + 0.65 * e) * (1 + c.lift * 0.06);
      c.g.scale.setScalar(Math.max(0.001, sc));
      c.g.rotation.set(0, side * -0.18 * e, c.s.tilt + (o.reducedMotion ? 0 : Math.sin(t * 0.6 + c.phase) * 0.015));
      c.g.visible = q > 0;
    });

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    rig.rotation.set(pointer.y * 0.08, pointer.x * 0.22, 0);
  }

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const half = Math.tan(THREE.MathUtils.degToRad(15));
    // Fit about 3.3 units across (the cards, lifted, with pointer sway) and 2.2 down, whichever is tighter.
    const dist = Math.max(1.1 / half, 1.65 / (half * aspect));
    camera.position.set(0, 0.3, dist);
    camera.lookAt(0, -0.08, 0);
    camera.updateProjectionMatrix();
  }

  let raf = 0;
  let visible = true;
  const render = (now: number) => {
    pose(now);
    renderer.render(scene, camera);
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (visible && !document.hidden) render(now);
  };

  const ro = new ResizeObserver(() => {
    resize();
    if (o.reducedMotion) render(performance.now());
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);
  resize();
  if (o.reducedMotion) {
    render(performance.now());
  } else {
    raf = requestAnimationFrame(loop);
  }

  return {
    focus(i) {
      focused = i;
      if (o.reducedMotion) {
        cards.forEach((c, j) => (c.lift = j === i ? 1 : 0));
        render(performance.now());
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      disposeTree(scene);
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
