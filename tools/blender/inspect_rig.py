import bpy

rig = bpy.data.objects["RIG-rain"]
print("=== ROOT CHILDREN / TOP LEVEL")
for b in rig.data.bones:
    if b.parent is None:
        print("top", b.name)

print("=== CONTROLS (have custom shapes)")
for pb in rig.pose.bones:
    if pb.custom_shape and not pb.name.startswith(("N-", "TAN", "BB", "STR-", "CTR-COR", "LTC")) and not any(k in pb.name for k in ("Eye", "Lip", "Mouth", "Brow", "Cheek", "Nose", "Jaw", "Tongue", "Teeth", "Ear", "Hair", "Scarf", "Lid")):
        b = pb.bone
        h, t = rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local
        print(pb.name, "| parent", b.parent.name if b.parent else None, "| head", tuple(round(x, 3) for x in h), "tail", tuple(round(x, 3) for x in t), "| rot", pb.rotation_mode)

print("=== IKFK PROPS")
for name in ("Properties_IKFK", "Properties"):
    pb = rig.pose.bones.get(name)
    if pb:
        print(name, {k: pb[k] for k in pb.keys() if not k.startswith("_")})
print("=== RIG PROPS", {k: str(rig[k])[:80] for k in rig.keys()})
