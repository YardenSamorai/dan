import bpy

seen = set()
for o in bpy.data.objects:
    if o.type != "MESH" or not o.name.startswith("GEO-rain"):
        continue
    for s in o.material_slots:
        m = s.material
        if not m or m.name in seen:
            continue
        seen.add(m.name)
        nodes = m.node_tree.nodes if m.use_nodes else []
        kinds = sorted({n.type if n.type != "GROUP" else f"GROUP:{n.node_tree.name}" for n in nodes})
        print(f"{o.name} :: {m.name} :: {kinds}")
        for n in nodes:
            if n.type == "GROUP":
                ins = [f"{i.name}={tuple(round(x, 2) for x in i.default_value) if hasattr(i.default_value, '__len__') else round(i.default_value, 3)}" for i in n.inputs if not i.is_linked and hasattr(i, "default_value")]
                print("   group", n.node_tree.name, ins[:14])
