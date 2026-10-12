import * as THREE from 'three';
import type { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { makeFigure, type Figure, type Look } from './figure';
import { box, cyl, group, mat, mesh, rot } from './kit';
import { CARRIAGE, clinic, home, nailStudio, pilatesStudio, pillar, salon, SCREEN } from './sets';
import { makeStage } from './stage';
import { cameraAt, castAt, lightAt, PILLAR_AT, ROOM_X, type Room } from './story';
import { minuteAt } from './timeline';

/**
 * The hero's renderer. It owns the WebGL scene and draws one frame per call;
 * the page decides when (only while scroll progress changes).
 */

export type Tier = 'high' | 'mid';
export type Quad = [[number, number], [number, number], [number, number], [number, number]];

export const HER: Look = { skin: '#c89f86', hair: '#2a211d', top: '#b2563d', bottom: '#2f2e33', shoes: '#efe8df', hairStyle: 'long', sleeve: 'mid' };

export interface Engine {
  /**
   * Draw the frame for p. Returns the monitor's corners on the page (TL, TR, BR, BL) when it is in view.
   * With `draw` false the camera and the pillar still update, but nothing is rendered.
   */
  frame(p: number, draw?: boolean): Quad | null;
  /** The pillar's left and right edges on the page at the last frame, when it is in view. */
  pillar(): [number, number] | null;
  /**
   * Frame the opening as if the screen were at least this wide (the prerendered film's camera), easing back
   * to the screen's own framing after the pillar. Null for the screen's own framing throughout.
   */
  matchAspect(aspect: number | null): void;
  resize(w: number, h: number, dpr: number, shift: number): void;
  dispose(): void;
  /** For the dev export page only: the live scene and cast. */
  inspect(): { scene: THREE.Scene; figures: Record<'her' | 'tech' | 'stylist' | 'doctor', Figure>; mirror: THREE.Object3D };
}

/**
 * A sketch of the booking page for the monitor while it is too small to need real text.
 * It follows the DOM panel's layout (800 x 500 at 0.8 scale), so the swap to real markup is invisible.
 */
function screenSketch(rtl: boolean) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 640, 400);
  g.fillStyle = '#ecebe8';
  g.fillRect(0, 41, 640, 1);
  const r = (x: number, y: number, w: number, h: number, col: string, rad = 6) => {
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(rtl ? 640 - x - w : x, y, w, h, rad);
    g.fill();
  };
  r(22, 10, 21, 21, '#f3dde3', 11);
  r(50, 15, 80, 11, '#3a3a3c', 3);
  r(22, 64, 74, 10, '#3a3a3c', 3);
  r(102, 64, 40, 10, '#b9b8b4', 3);
  r(22, 84, 150, 18, '#1c1c1e', 4);
  const dw = (640 - 44 - 5 * 8) / 6;
  for (let i = 0; i < 6; i++) r(22 + i * (dw + 8), 120, dw, 48, i === 2 ? '#1c1c1e' : '#f4f4f2', 8);
  const sw = (640 - 44 - 3 * 8) / 4;
  for (let i = 0; i < 4; i++) r(22 + i * (sw + 8), 186, sw, 40, '#f4f4f2', 6);
  r(640 - 22 - 120, 346, 120, 34, '#1c1c1e', 17);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft glass: a cool vertical fall-off and one diagonal sheen. The salon mirror and the clinic screen share it, so the cut between them is seamless. */
function glassTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 360;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 0, 0, 360);
  v.addColorStop(0, '#eef0ef');
  v.addColorStop(1, '#dde1e0');
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 360);
  const s = g.createLinearGradient(0, 360, 256, 0);
  s.addColorStop(0.38, 'rgba(255,255,255,0)');
  s.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  s.addColorStop(0.56, 'rgba(255,255,255,0.1)');
  s.addColorStop(0.64, 'rgba(255,255,255,0.35)');
  s.addColorStop(0.72, 'rgba(255,255,255,0)');
  g.fillStyle = s;
  g.fillRect(0, 0, 256, 360);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hair scissors, held in the right hand: two steel blades, two dark finger rings. */
function scissors() {
  const steel = mat('#d0d0ce', { rough: 0.22, metal: 0.95 });
  const ringM = mat('#232222', { rough: 0.4, clear: 0.5 });
  const g = group(
    rot(box(0.006, 0.09, 0.0025, steel, 0.001, [0.003, -0.05, 0]), 0, 0, 0.05),
    rot(box(0.006, 0.09, 0.0025, steel, 0.001, [-0.003, -0.05, 0.003]), 0, 0, -0.05),
    rot(mesh(new THREE.TorusGeometry(0.011, 0.0025, 8, 20), ringM), 0, 0, 0),
    rot(mesh(new THREE.TorusGeometry(0.011, 0.0025, 8, 20), ringM), 0, 0, 0),
  );
  g.children[2].position.set(0.012, 0.012, 0);
  g.children[3].position.set(-0.012, 0.012, 0.003);
  g.position.set(0.012, -0.07, 0.025);
  g.rotation.set(-0.9, 0, 0);
  return g;
}

/** A polish brush pinched between thumb and fingers: a glossy cap-handle and a short tip. */
function brush() {
  const g = group(cyl(0.006, 0.0075, 0.06, mat('#151414', { rough: 0.16, clear: 0.9 })), cyl(0.0025, 0.0012, 0.014, mat('#9c3a47', { rough: 0.2, clear: 1 })));
  g.children[0].position.y = 0.018;
  g.children[1].position.y = -0.019;
  g.position.set(0.012, -0.075, 0.03);
  g.rotation.set(0.5, 0, 0);
  return g;
}

/** A tablet held against the left forearm: a slim aluminium slab with a lit screen. */
function tablet() {
  const screen = new THREE.MeshBasicMaterial({ color: '#e9eeee' });
  const g = group(box(0.16, 0.22, 0.008, mat('#9ea2a6', { rough: 0.35, metal: 0.8 }), 0.006, [0, 0, 0]));
  const face = mesh(new THREE.PlaneGeometry(0.145, 0.205), screen, false);
  face.position.z = 0.0042;
  g.add(face);
  g.rotation.set(0, Math.PI / 2, 0);
  g.position.set(-0.02, -0.08, 0.02);
  return g;
}

export function createEngine(canvas: HTMLCanvasElement, tier: Tier, rtl = true): Engine {
  const stage = makeStage(canvas, { shadows: tier === 'high' ? 2048 : 1024, antialias: tier === 'high' });
  const { scene, camera, sun, sky, renderer } = stage;

  const sets = { nails: nailStudio(), pilates: pilatesStudio(), hair: salon(tier === 'high' ? 512 : 256), clinic: clinic(), home: home() };
  (Object.keys(sets) as Room[]).forEach((r) => {
    sets[r].group.position.x = ROOM_X[r];
    scene.add(sets[r].group);
  });
  const col = pillar();
  col.position.set(...PILLAR_AT);
  scene.add(col);

  // Screens and glass show exact colours: they are the surfaces the cuts and the handoff happen on.
  const screenMesh = sets.home.parts.screen as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  screenMesh.material.map = screenSketch(rtl);
  screenMesh.material.toneMapped = false;
  screenMesh.material.needsUpdate = true;
  const glass = glassTexture();
  for (const r of ['hair', 'clinic'] as const) {
    const m = (sets[r].parts.glass as THREE.Mesh).material as THREE.MeshBasicMaterial;
    m.toneMapped = false;
    m.color.set('#ffffff');
    m.map = glass;
    m.needsUpdate = true;
  }
  // The lamp lives at the scene root: if hiding the home room hid the light, the light count would change and every shader would recompile.
  const lamp = sets.home.parts.lamp as THREE.PointLight;
  lamp.position.x += ROOM_X.home;
  scene.add(lamp);

  const veil = (sets.hair.parts.glass as THREE.Mesh).material as THREE.MeshBasicMaterial;
  const carriage = sets.pilates.parts.carriage;
  const springs = sets.pilates.parts.springs;

  // A soft fill from the front left, no shadows: it opens up faces and fabric folds the sun leaves dark.
  const fill = new THREE.DirectionalLight('#fff6ee', 0.42);
  fill.position.set(-4, 3, 6);
  scene.add(fill, fill.target);
  const TONE: Record<Room, string> = { nails: '#fff3e9', pilates: '#f5f8f1', hair: '#fff2e6', clinic: '#e9f1f4', home: '#ffe6cf' };

  const her = makeFigure(HER);
  const tech = makeFigure({ skin: '#a87a62', hair: '#1b1715', top: '#e6e1da', bottom: '#d8d2ca', shoes: '#3a3633', hairStyle: 'bun', sleeve: 'long', scale: 0.98 });
  const stylist = makeFigure({ skin: '#d9b59c', hair: '#3b2f29', top: '#262628', bottom: '#cfc8bf', shoes: '#262628', hairStyle: 'short', sleeve: 'long', scale: 1.02 });
  const doctor = makeFigure({ skin: '#b98a6e', hair: '#5b4a40', top: '#cfd8d8', bottom: '#8d949c', shoes: '#e9e9e7', hairStyle: 'short', coat: '#f6f6f3', stethoscope: true, scale: 1.03 });
  stylist.rightHand.add(scissors());
  tech.rightHand.add(brush());
  doctor.leftHand.add(tablet());
  scene.add(her.root, tech.root, stylist.root, doctor.root);

  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const mix = (out: THREE.Color, [a, b, t]: [string, string, number]) => out.copy(cA.set(a)).lerp(cB.set(b), t);
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const sc = { x: ROOM_X.home + screenMesh.position.x, y: SCREEN.y, z: SCREEN.z + 0.0005 };
  const focus = new THREE.Vector3();
  const edge = new THREE.Vector3();
  let pillarEdges: [number, number] | null = null;
  let match: number | null = null;
  let W = 1;
  let H = 1;
  // Compile every material now, so the first sight of a room doesn't stall a frame.
  renderer.compile(scene, camera);
  // The live mirror draws the salon into its own target, which needs its own shader variants: build them now too.
  const mirror = sets.hair.parts.mirror as Reflector;
  if (mirror.isMesh && 'getRenderTarget' in mirror) {
    renderer.setRenderTarget(mirror.getRenderTarget());
    renderer.compile(scene, camera);
    renderer.setRenderTarget(null);
  }
  // Upload every texture and draw one frame with everything visible, so shadow shaders and uploads happen before the reveal.
  const seen = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
    if (!m) return;
    for (const t of [m.map, m.bumpMap]) if (t && !seen.has(t)) (seen.add(t), renderer.initTexture(t));
  });
  renderer.initTexture(glass);
  const far = camera.far;
  camera.position.set(12, 40, 12);
  camera.lookAt(12, 0, 0);
  camera.far = 200;
  camera.updateProjectionMatrix();
  stage.focusShadow(new THREE.Vector3(12, 0.6, 0), 6.5);
  stage.render();
  camera.far = far;

  return {
    resize(w, h, dpr, shift) {
      W = w;
      H = h;
      stage.setSize(w, h, dpr);
      camera.setViewOffset(w, h, shift, 0, w, h);
    },

    frame(p, draw = true) {
      const a = W / H;
      const k = match ? 1 - THREE.MathUtils.smoothstep(p, 0.2, 0.27) : 0;
      const cam = cameraAt(p, k > 0 ? THREE.MathUtils.lerp(a, Math.max(a, match!), k) : a);
      camera.fov = cam.fov;
      camera.position.set(...cam.pos);
      camera.lookAt(...cam.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      col.visible = p > 0.1 && p < 0.27;
      pillarEdges = null;
      if (col.visible) {
        // Silhouette edges of the 0.3 m shaft at eye height.
        const dx = PILLAR_AT[0] - cam.pos[0];
        const dz = PILLAR_AT[2] - cam.pos[2];
        const n = Math.hypot(dx, dz);
        const xs: number[] = [];
        for (const s of [-1, 1]) {
          edge.set(PILLAR_AT[0] + (s * 0.3 * dz) / n, cam.target[1], PILLAR_AT[2] - (s * 0.3 * dx) / n).project(camera);
          if (edge.z < -1 || edge.z > 1) break;
          xs.push(((edge.x + 1) / 2) * W);
        }
        if (xs.length === 2) pillarEdges = [Math.min(xs[0], xs[1]), Math.max(xs[0], xs[1])];
      }
      if (!draw) return null;

      const L = lightAt(minuteAt(p));
      mix(sun.color, L.sun);
      sun.intensity = L.sunI;
      mix(sky.color, L.sky);
      mix(sky.groundColor, L.ground);
      sky.intensity = L.skyI;
      scene.environmentIntensity = L.env;
      renderer.toneMappingExposure = L.exposure;
      lamp.intensity = L.lamp;
      fill.intensity = 0.42 * Math.min(1, L.sunI / 1.6) + 0.12;

      // Shadows: tight on the room the camera is in, wider when it pulls back.
      const d = Math.hypot(cam.pos[0] - cam.target[0], cam.pos[1] - cam.target[1], cam.pos[2] - cam.target[2]);
      const nearest = (Object.keys(ROOM_X) as Room[]).reduce((a, b) => (Math.abs(ROOM_X[b] - cam.target[0]) < Math.abs(ROOM_X[a] - cam.target[0]) ? b : a));
      const wide = THREE.MathUtils.smoothstep(d, 5, 9);
      focus.set(THREE.MathUtils.lerp(ROOM_X[nearest], cam.target[0], wide), 0.6, 0);
      fill.color.lerp(cA.set(TONE[nearest]), 0.25);
      fill.target.position.set(cam.target[0], 0.6, 0);
      sun.position.set(...L.dir);
      sun.target.position.set(0, 0, 0);
      stage.focusShadow(focus, THREE.MathUtils.lerp(3.2, 6.5, wide));

      // Only rooms near the camera are drawn.
      (Object.keys(sets) as Room[]).forEach((r) => (sets[r].group.visible = Math.abs(ROOM_X[r] - cam.target[0]) < 4 + d * 0.7));

      const c = castAt(p);
      her.pose(c.her);
      if (her.hair) {
        her.hair.long.visible = c.hair === 'long';
        her.hair.bob.visible = c.hair === 'bob';
      }
      tech.pose(c.tech);
      stylist.pose(c.stylist);
      doctor.pose(c.doctor);
      carriage.position.x = c.carriage;
      springs.position.x = c.carriage + 0.45;
      springs.scale.x = CARRIAGE.foot - springs.position.x;
      veil.opacity = 0.22 + 0.78 * THREE.MathUtils.smoothstep(p, 0.515, 0.548);
      tech.root.visible = sets.nails.group.visible;
      stylist.root.visible = sets.hair.group.visible;
      doctor.root.visible = sets.clinic.group.visible;
      her.root.visible = sets[c.room].group.visible;

      stage.render();

      if (!sets.home.group.visible) return null;
      const hw = SCREEN.w / 2;
      const hh = SCREEN.h / 2;
      corners[0].set(sc.x - hw, sc.y + hh, sc.z);
      corners[1].set(sc.x + hw, sc.y + hh, sc.z);
      corners[2].set(sc.x + hw, sc.y - hh, sc.z);
      corners[3].set(sc.x - hw, sc.y - hh, sc.z);
      const out: [number, number][] = [];
      for (const v of corners) {
        v.project(camera);
        if (v.z > 1 || v.z < -1) return null;
        out.push([((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]);
      }
      return out as Quad;
    },

    pillar: () => pillarEdges,

    matchAspect(v) {
      match = v;
    },

    inspect: () => ({ scene, figures: { her, tech, stylist, doctor }, mirror }),

    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      screenMesh.material.map?.dispose();
      stage.dispose();
    },
  };
}
