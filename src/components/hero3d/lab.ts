import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createEngine, HER } from './engine';
import { cameraAt, castAt, lightAt } from './story';
import { minuteAt } from './timeline';
import { HIP, makeFigure } from './figure';
import { contact } from './kit';
import { makeStage } from './stage';

/** Dev-only lab: renders the hero's 3D frame for ?p= (or a figure study for ?fig=), for still review and the exported stills. */
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const w = window as unknown as { __ready: boolean; __quad: unknown; __frame: (p: number) => unknown };

if (q.has('fig')) {
  const stage = makeStage(canvas, { shadows: 2048, antialias: true });
  stage.setSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshPhysicalMaterial({ color: '#ebe6df', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  stage.scene.add(floor);
  const a = makeFigure(HER);
  a.pose({ at: [-0.55, 0, 0], turn: 20, lSh: [0, 0, 8], rSh: [0, 0, -8], lEl: [-12, 0, 0], rEl: [-12, 0, 0], curl: [0.3, 0.3] });
  const b = makeFigure({ ...HER, hairStyle: 'bob' });
  const seatY = 0.47;
  b.pose({
    at: [0.55, seatY + 0.09 - HIP, 0],
    turn: -30,
    spine: [-4, 0, 0],
    chest: [8, 0, 0],
    lHip: [-86, 0, -4],
    rHip: [-84, 0, 3],
    lKn: [80, 0, 0],
    rKn: [86, 0, 0],
    lAn: [6, 0, 0],
    rAn: [0, 0, 0],
    lSh: [-36, 0, 10],
    lEl: [-56, 30, 0],
    rSh: [-30, 0, -12],
    rEl: [-60, -30, 0],
    head: [6, 0, 0],
    curl: [0.45, 0.45],
  });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), new THREE.MeshPhysicalMaterial({ color: '#d8cfc4', roughness: 0.8 }));
  seat.position.set(0.55, seatY - 0.02, 0);
  seat.castShadow = seat.receiveShadow = true;
  stage.scene.add(a.root, b.root, seat, contact(0.5, 0.5, [-0.55, 0, 0], 0.8));
  stage.sun.position.set(3, 6, 5);
  stage.focusShadow(new THREE.Vector3(0, 0.8, 0), 2);
  const shot = q.get('fig');
  const cam =
    shot === 'hands'
      ? { p: [-0.25, 1.0, 0.8], t: [-0.5, 0.85, 0] }
      : shot === 'head'
        ? { p: [-0.2, 1.55, 0.9], t: [-0.5, 1.5, 0] }
        : shot === 'back'
          ? { p: [1.6, 1.3, -1.2], t: [0.55, 0.95, 0] }
          : { p: [0, 1.0, 4.6], t: [0, 0.85, 0] };
  stage.camera.position.set(...(cam.p as [number, number, number]));
  stage.camera.lookAt(...(cam.t as [number, number, number]));
  stage.camera.updateProjectionMatrix();
  stage.render();
  w.__frame = () => stage.render();
  w.__ready = true;
} else if (q.has('export')) {
  // Hands the sets, camera path and cast motion to the Blender pipeline (tools/blender). Three's Y-up metres throughout.
  const engine = createEngine(canvas, 'high');
  engine.resize(800, 500, 1, 0);
  const { scene, figures, mirror } = engine.inspect();
  const n = +(q.get('export') || 1200);
  const v = new THREE.Vector3();
  const qt = new THREE.Quaternion();
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
  const frames = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    engine.frame(p);
    const c = castAt(p);
    const cast: Record<string, unknown> = {};
    for (const [name, f] of Object.entries(figures)) {
      const joints: Record<string, number[]> = {};
      for (const [j, o] of Object.entries(f.joints)) {
        o.getWorldPosition(v);
        o.getWorldQuaternion(qt);
        joints[j] = [v.x, v.y, v.z, qt.x, qt.y, qt.z, qt.w].map(r4);
      }
      const pose = c[name as 'her'];
      const ik = Object.fromEntries(Object.entries(pose.ik ?? {}).map(([k, r]) => [k, r!.to.map(r4)]));
      cast[name] = { visible: f.root.visible, joints, ik };
    }
    const cams = Object.fromEntries(
      (
        [
          ['wide', 1.8],
          ['tall', 430 / 932],
        ] as const
      ).map(([k, a]) => [k, cameraAt(p, a)]),
    );
    frames.push({ p: r4(p), minute: minuteAt(p), room: c.room, hair: c.hair, carriage: r4(c.carriage), cam: cams, light: lightAt(minuteAt(p)), cast });
  }

  // The scene without its people, fake contact blobs or the live mirror: Blender has real shadows and reflections.
  // At 0.18 the pillar between the first two rooms is in.
  engine.frame(0.18);
  const hidden: THREE.Object3D[] = [mirror, ...Object.values(figures).map((f) => f.root)];
  scene.traverse((o) => o.name === 'contact' && hidden.push(o));
  scene.traverse((o) => o.type === 'Group' && (o.visible = true));
  for (const o of hidden) o.visible = false;
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true })) as ArrayBuffer;
  const b64 = await new Promise<string>((res) => {
    const fr = new FileReader();
    fr.onload = () => res((fr.result as string).split(',')[1]);
    fr.readAsDataURL(new Blob([glb]));
  });
  (w as unknown as { __export: unknown }).__export = { glb: b64, frames };
  w.__ready = true;
} else {
  const engine = createEngine(canvas, 'high');
  engine.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2), +(q.get('shift') ?? 0));
  w.__quad = engine.frame(+(q.get('p') ?? 0));
  w.__frame = (p: number) => engine.frame(p);
  w.__ready = true;
}
