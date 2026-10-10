"""Manicure scene. blender -b -P tools/blender/build_nails.py -- [first last | --frames a,b,c]"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from cast import CUSTOMER, TECH, Actor, append_rain, curl  # noqa: E402
from lib import ROOT, Rig, bounds, import_sets, key_camera, load_frames, make_camera, move, reset_scene, select, set_resolution, upgrade_materials, v3  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if args[:1] == ["--frames"]:
    FRAMES = [int(a) for a in args[1].split(",")]
else:
    # Up to the pillar wipe, every second export frame (the site draws 1 image per 2 frames).
    F0, F1 = (int(args[0]), int(args[1])) if len(args) >= 2 else (0, 240)
    FRAMES = list(range(F0, F1 + 1, 2))

t = time.time()
s = reset_scene()
# 2.1:1 covers every desktop viewport the site uses it on (aspect 1.75 and up) when fitted to height.
set_resolution(1890, 900)
sets = import_sets(lambda c: -3.3 < c.x < 3.2)
upgrade_materials(sets)

# ── Layout: the web table is 1 m long with the two women at its ends, too far for Rain's reach.
# A real manicure table is narrower: 70% here. Surfaces scale, small things keep their size and move.
NARROW = 0.7
table_zone = select(sets, (-0.52, -0.45, -0.01), (0.52, 0.25, 0.9))
tray = select(table_zone, (0.13, -0.3, 0.75), (0.43, -0.18, 0.9))
for o in table_zone:
    a, b = bounds(o)
    cx = (a.x + b.x) / 2
    if o in tray:
        move([o], (0.28 * (NARROW - 1), 0, 0))
    elif b.x - a.x > 0.3:
        o.matrix_world = Matrix.Diagonal((NARROW, 1, 1, 1)) @ o.matrix_world
    else:
        move([o], (cx * (NARROW - 1), 0, 0))
HER_SHIFT = (0.10, 0, 0)
TECH_SHIFT = (-0.3, 0, 0)
move(select(sets, (-0.97, -0.4, -0.01), (-0.46, 0.12, 0.9)), HER_SHIFT)
move(select(sets, (0.34, -0.34, -0.01), (0.78, 0.1, 0.56)), TECH_SHIFT)

light = Rig()
cam = make_camera()
frames = load_frames()

her = Actor(*append_rain(), CUSTOMER, shift=HER_SHIFT, curls={**curl("L", a=(18, 28, 16), thumb=(0, 10, 10)), **curl("R", a=(6, 8, 5))})
tech = Actor(*append_rain(), TECH, shift=TECH_SHIFT, hands=(0.27, 0, 0), lean=0.65, elbows_down=1.2, curls={**curl("L", a=(12, 18, 10)), **curl("R", a=(35, 50, 30), thumb=(10, 25, 20))})
print("setup", round(time.time() - t, 1))

# Posing only needs the rigs; evaluating the subdivided meshes on every update is what makes baking slow.
viewport = {o: o.hide_viewport for a in (her, tech) for o in a.meshes}
for o in viewport:
    o.hide_viewport = True
for f in FRAMES:
    fr = frames[f]
    s.frame_set(f)
    key_camera(cam, fr["cam"]["wide"], f)
    light.key(fr["light"], f)
    hand = v3(fr["cast"]["her"]["joints"]["rWr"][:3]) + Vector(HER_SHIFT)
    fingers = hand + Vector((0.09, 0, -0.01))
    tech.pose(fr["cast"]["tech"], f, look=fingers + Vector((0.02, 0, 0)))
    # She chats with the technician while her hand is done.
    tech_face = tech.rig.pose.bones["FK-Head"].head + Vector((0, -0.05, 0.1))
    her.pose(fr["cast"]["her"], f, look=tech_face)
for o, hidden in viewport.items():
    o.hide_viewport = hidden
s.frame_start, s.frame_end = FRAMES[0], FRAMES[-1]
print("baked", len(FRAMES), "frames", round(time.time() - t, 1))

out = ROOT / "out"
out.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "nails.blend"))
print("saved", out / "nails.blend", round(time.time() - t, 1))
