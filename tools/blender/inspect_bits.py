import bpy

rig = bpy.data.objects["RIG-rain"]
for pb in rig.pose.bones:
    n = pb.name
    if pb.custom_shape and any(k in n for k in ("Pony", "pony", "Hair", "Tail", "TGT", "Eyes", "Strand")):
        b = pb.bone
        print("BONE", n, "parent", b.parent.name if b.parent else None, tuple(round(x, 3) for x in b.head_local), tuple(round(x, 3) for x in b.tail_local))
for o in bpy.data.objects:
    ad = o.animation_data
    if ad and ad.drivers:
        for d in ad.drivers:
            if "hide" in d.data_path:
                print("DRIVER", o.name, d.data_path, d.driver.expression)
for c in bpy.data.collections:
    ad = getattr(c, "animation_data", None)
props = rig.pose.bones.get("Properties")
print("RIGPROPS", {k: rig.data[k] for k in rig.data.keys() if not k.startswith("_")} if rig.data.keys() else None)
for pb in rig.pose.bones:
    ks = [k for k in pb.keys() if not k.startswith(("_", "cloudrig"))]
    if ks and pb.name != "Properties_IKFK":
        print("PROPS", pb.name, {k: pb[k] for k in ks})
