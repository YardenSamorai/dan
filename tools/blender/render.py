"""Render frames of a built scene. blender -b out/<scene>.blend -P render.py -- <prefix> <frame> [frame ...] [--pct N]"""
import sys
from pathlib import Path

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
pct = 100
if "--pct" in args:
    i = args.index("--pct")
    pct = int(args[i + 1])
    del args[i:i + 2]
prefix, frames = str(Path(args[0]).resolve()), [int(a) for a in args[1:]]
s = bpy.context.scene
s.render.resolution_percentage = pct
for f in frames:
    s.frame_set(f)
    s.render.filepath = f"{prefix}-{f:04d}.png"
    bpy.ops.render.render(write_still=True)
    print("frame", f, "done")
