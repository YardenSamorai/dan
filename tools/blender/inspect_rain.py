import bpy
from mathutils import Vector

print("=== COLLECTIONS")
for c in bpy.data.collections:
    print(c.name, len(c.objects))

print("=== OBJECTS")
for o in bpy.data.objects:
    extra = ""
    if o.type == "ARMATURE":
        extra = f"bones={len(o.data.bones)}"
    if o.type == "MESH":
        extra = f"verts={len(o.data.vertices)} mods={[m.type for m in o.modifiers]}"
    print(o.type, o.name, extra, "hidden" if o.hide_render else "")

rig = next((o for o in bpy.data.objects if o.type == "ARMATURE" and "rain" in o.name.lower()), None)
if rig:
    print("=== RIG", rig.name, "props:", list(rig.keys())[:40])
    names = [b.name for b in rig.data.bones]
    for key in ("IK", "FK", "hand", "foot", "spine", "head", "torso", "root", "finger", "thumb"):
        hits = [n for n in names if key.lower() in n.lower() and not n.startswith(("DEF", "ORG", "MCH"))]
        print(key, hits[:16])

deps = bpy.context.evaluated_depsgraph_get()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in bpy.data.objects:
    if o.type == "MESH" and not o.hide_render:
        e = o.evaluated_get(deps)
        for v in e.bound_box:
            w = e.matrix_world @ Vector(v)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
print("=== BOUNDS", tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))
print("=== SCENE", bpy.context.scene.name, bpy.context.scene.render.engine, "texts:", [t.name for t in bpy.data.texts])
