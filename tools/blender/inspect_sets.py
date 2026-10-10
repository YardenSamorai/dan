import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import import_sets, reset_scene  # noqa: E402

reset_scene()
objs = import_sets(lambda c: -1.4 < c.x < 1.2 and c.z < 1.2)
for o in sorted(objs, key=lambda o: o.matrix_world.translation.x):
    ws = [o.matrix_world @ Vector(b) for b in o.bound_box]
    lo = Vector([min(v[i] for v in ws) for i in range(3)])
    hi = Vector([max(v[i] for v in ws) for i in range(3)])
    look = o.material_slots[0].material.get("look", "")[:28] if o.material_slots and o.material_slots[0].material else ""
    print("OBJ", o.name, "lo", tuple(round(x, 2) for x in lo), "hi", tuple(round(x, 2) for x in hi), look)
