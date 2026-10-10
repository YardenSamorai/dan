import bpy

s = bpy.context.scene
s.frame_set(90)
for rig in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
    pb = rig.pose.bones
    t = pb["TGT-Eyes"]
    print("RIG", rig.name, "TGT world", tuple(round(x, 3) for x in rig.matrix_world @ t.head), "constraints", [(c.type, c.name, round(c.influence, 2), getattr(c, "subtarget", "")) for c in t.constraints])
    print("  parents prop", pb["Properties_Face"].get("eye_target_parents"))
    for n in ("DEF-Eye.L", "MCH-Eye.L", "Eye.L", "STR-Eye.L", "TRK-Eye.L"):
        if n in pb:
            b = pb[n]
            print("  ", n, "dir", tuple(round(x, 2) for x in (b.tail - b.head).normalized()), [(c.type, getattr(c, "subtarget", "")) for c in b.constraints])
    eyes = [b.name for b in pb if "Eye" in b.name and "Lid" not in b.name and "brow" not in b.name.lower()][:30]
    print("  eye bones", eyes)
