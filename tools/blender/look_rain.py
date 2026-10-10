import bpy, math, sys
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1200, 900
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

world = scene.world or bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.92, 0.91, 0.89, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6

floor = bpy.data.meshes.new("floor")
floor.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
fo = bpy.data.objects.new("floor", floor)
scene.collection.objects.link(fo)
fm = bpy.data.materials.new("floor")
fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.9, 0.89, 0.86, 1)
floor.materials.append(fm)

def light(kind, energy, loc, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(kind, kind)
    d.energy = energy
    d.color = color
    if kind == "AREA":
        d.size = size
    o = bpy.data.objects.new(kind, d)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(o)

light("AREA", 600, (-2.5, -3, 3.2), 3, (1, 0.95, 0.88))
light("AREA", 150, (3, -2, 1.8), 2.5, (0.9, 0.95, 1))
light("AREA", 250, (0.5, 3, 2.6), 2, (1, 0.97, 0.92))

cam_d = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_d)
scene.collection.objects.link(cam)
scene.camera = cam

def shot(name, loc, target, lens):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam_d.lens = lens
    scene.render.filepath = f"{out}-{name}.png"
    bpy.ops.render.render(write_still=True)

shot("full", (1.6, -4.2, 1.1), (0, 0, 0.82), 50)
shot("face", (0.45, -1.3, 1.45), (0, 0, 1.4), 70)
