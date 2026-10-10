"""Shared pieces of the hero's Blender pipeline.

The web hero (src/components/hero3d) stays the source of truth for layout, camera and motion:
qa/export-blender.mjs writes its sets as sets.glb and its camera, light and cast per frame as
frames.json. This module turns those into a Blender scene with real materials, light and characters.
Three is Y-up, Blender is Z-up: (x, y, z) -> (x, -z, y), which is a +90 degree turn about X.
"""
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RAIN_BLEND = ROOT / "assets" / "rain" / "Rain v3.3" / "rain_v3.2.blend"


# ── Coordinates ───────────────────────────────────────────────────────
def v3(a):
    return Vector((a[0], -a[2], a[1]))


def q3(a):
    """Three quaternion [x, y, z, w] as a Blender rotation."""
    return Quaternion((a[3], a[0], -a[2], a[1]))


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def mix_hex(pair):
    a, b, t = pair
    ca, cb = hex_rgb(a), hex_rgb(b)
    return tuple(x + (y - x) * t for x, y in zip(ca, cb))


def load_frames():
    with open(DATA / "frames.json", encoding="utf-8") as f:
        return json.load(f)


# ── Scene and render settings ─────────────────────────────────────────
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.render.film_transparent = True
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    e = s.eevee
    for k, v in {
        "taa_render_samples": 64,
        "use_raytracing": True,
        "ray_tracing_method": "SCREEN",
        "use_shadows": True,
        "shadow_ray_count": 2,
        "shadow_step_count": 8,
        "use_fast_gi": True,
        "fast_gi_method": "GLOBAL_ILLUMINATION",
        "fast_gi_distance": 1.5,
        "use_volumetric_shadows": False,
    }.items():
        if hasattr(e, k):
            setattr(e, k, v)
    if hasattr(e, "ray_tracing_options"):
        e.ray_tracing_options.resolution_scale = "1"
        e.ray_tracing_options.use_denoise = True
    return s


def set_resolution(w, h, pct=100):
    r = bpy.context.scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, pct


# ── Sets ──────────────────────────────────────────────────────────────
def import_sets(keep):
    """Import sets.glb and keep only mesh objects whose centre passes keep(x, y, z) (Blender coords)."""
    bpy.ops.import_scene.gltf(filepath=str(DATA / "sets.glb"))
    bpy.context.view_layer.update()
    drop = []
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            continue
        c = sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector()) / 8
        if not keep(c):
            drop.append(o)
    for o in drop:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.context.scene.objects):
        if o.type == "EMPTY" and not o.children:
            bpy.data.objects.remove(o, do_unlink=True)
    sets = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in sets:
        o.data.shade_smooth() if len(o.data.polygons) > 40 else None
    return sets


def bounds(o):
    ws = [o.matrix_world @ Vector(b) for b in o.bound_box]
    return Vector([min(v[i] for v in ws) for i in range(3)]), Vector([max(v[i] for v in ws) for i in range(3)])


def select(objs, lo, hi):
    """Objects whose bounds lie inside the box lo..hi (Blender coords)."""
    out = []
    for o in objs:
        a, b = bounds(o)
        if all(lo[i] <= a[i] and b[i] <= hi[i] for i in range(3)):
            out.append(o)
    return out


def move(objs, d):
    for o in objs:
        o.matrix_world.translation += Vector(d)


def _principled(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _set(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


def _longest_axis(o):
    d = o.dimensions
    return max(range(3), key=lambda i: d[i])


def _coords(nt, o, stretch=None):
    """Object-space coordinates, optionally stretched along the object's longest axis (grain, brushing)."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    if stretch:
        s = [1.0, 1.0, 1.0]
        s[_longest_axis(o)] = 1.0 / stretch
        mp.inputs["Scale"].default_value = s
    return mp.outputs["Vector"]


def _bump(nt, bsdf, height, strength, distance=0.01):
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = distance
    nt.links.new(height, b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])


def _vary(nt, bsdf, base, coord, scale, amount, detail=4.0):
    """Base colour with a low-frequency value variation, so flat colours stop reading as CG."""
    if bsdf.inputs["Base Color"].is_linked:
        return
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = detail
    nt.links.new(coord, nz.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = (*base, 1)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (1 - amount, 1 - amount, 1 - amount, 1)
    ramp.color_ramp.elements[1].color = (1 + amount * 0.5, 1 + amount * 0.5, 1 + amount * 0.5, 1)
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])


def upgrade_materials(objs):
    """Rebuild the web materials (identified by their 'look' key from kit.ts) as physically based Blender materials."""
    done = {}
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            look = m.get("look")
            if not look:
                continue
            key = (m.name, _longest_axis(o)) if "grain" in look else m.name
            if key in done:
                slot.material = done[key]
                continue
            if "grain" in look and m.users > 1:
                m = m.copy()
                slot.material = m
            color, opts = look.split("|", 1)
            opts = json.loads(opts)
            _build(m, o, hex_rgb(color), opts)
            done[key] = m


def _build(m, o, base, opts):
    nt = m.node_tree
    bsdf = _principled(m)
    rough = opts.get("rough", 0.82)
    _set(bsdf, "Roughness", rough)
    _set(bsdf, "Metallic", opts.get("metal", 0.0))
    _set(bsdf, "Specular IOR Level", 0.5 * opts.get("spec", 1.0))
    if not bsdf.inputs["Base Color"].is_linked:
        _set(bsdf, "Base Color", (*base, 1))
    if opts.get("clear"):
        _set(bsdf, "Coat Weight", min(1.0, opts["clear"]))
        _set(bsdf, "Coat Roughness", opts.get("clearRough", 0.3))
    if opts.get("sheen"):
        _set(bsdf, "Sheen Weight", opts["sheen"])
        _set(bsdf, "Sheen Roughness", 0.6)
    if "opacity" in opts:
        # Glass and lacquer shells: real transmission instead of see-through alpha.
        _set(bsdf, "Transmission Weight", 1.0)
        _set(bsdf, "Roughness", 0.02)
        _set(bsdf, "IOR", 1.47)
        _set(bsdf, "Alpha", 1.0)
        m.blend_method = "OPAQUE" if hasattr(m, "blend_method") else None
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "DITHERED"
        if hasattr(m, "use_screen_refraction"):
            m.use_screen_refraction = True
        return
    surf = opts.get("bump")
    if opts.get("metal", 0) >= 0.5:
        _set(bsdf, "Anisotropic", 0.4)
        c = _coords(nt, o, stretch=40)
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 120
        nt.links.new(c, nz.inputs["Vector"])
        _bump(nt, bsdf, nz.outputs["Fac"], 0.04, 0.002)
        return
    if surf == "grain":
        c = _coords(nt, o, stretch=14)
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "RINGS"
        wave.inputs["Scale"].default_value = 3.0
        wave.inputs["Distortion"].default_value = 6.0
        wave.inputs["Detail"].default_value = 3.0
        nt.links.new(c, wave.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (*[x * 0.86 for x in base], 1)
        ramp.color_ramp.elements[1].color = (*[min(1, x * 1.06) for x in base], 1)
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, wave.outputs["Fac"], 0.06, 0.004)
        return
    if surf == "plaster":
        c = _coords(nt, o)
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 60
        nz.inputs["Detail"].default_value = 8
        nt.links.new(c, nz.inputs["Vector"])
        _bump(nt, bsdf, nz.outputs["Fac"], 0.05, 0.004)
        _vary(nt, bsdf, base, c, 1.6, 0.025)
        return
    if surf in ("weave", "knit", "twill"):
        c = _coords(nt, o)
        wx = nt.nodes.new("ShaderNodeTexWave")
        wx.inputs["Scale"].default_value = 900
        wx.bands_direction = "X"
        wy = nt.nodes.new("ShaderNodeTexWave")
        wy.inputs["Scale"].default_value = 900
        wy.bands_direction = "Y"
        for w in (wx, wy):
            nt.links.new(c, w.inputs["Vector"])
        mx = nt.nodes.new("ShaderNodeMath")
        mx.operation = "MULTIPLY"
        nt.links.new(wx.outputs["Fac"], mx.inputs[0])
        nt.links.new(wy.outputs["Fac"], mx.inputs[1])
        _bump(nt, bsdf, mx.outputs[0], 0.12, 0.002)
        _vary(nt, bsdf, base, c, 2.5, 0.05)
        _set(bsdf, "Sheen Weight", max(0.6, opts.get("sheen", 0)))
        return
    if surf == "leather":
        c = _coords(nt, o)
        vo = nt.nodes.new("ShaderNodeTexVoronoi")
        vo.inputs["Scale"].default_value = 260
        nt.links.new(c, vo.inputs["Vector"])
        _bump(nt, bsdf, vo.outputs["Distance"], 0.08, 0.002)
        _vary(nt, bsdf, base, c, 4, 0.05)
        return
    c = _coords(nt, o)
    _vary(nt, bsdf, base, c, 3, 0.02)


# ── Light ─────────────────────────────────────────────────────────────
class Rig:
    """Sun (the time of day), a soft front fill and a two-tone sky, driven per frame from frames.json."""

    def __init__(self):
        s = bpy.context.scene
        w = bpy.data.worlds.new("hero-sky")
        s.world = w
        w.use_nodes = True
        nt = w.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputWorld")
        bg = nt.nodes.new("ShaderNodeBackground")
        geo = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Generated"], sep.inputs[0])
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["From Min"].default_value = -0.3
        ramp.inputs["From Max"].default_value = 0.4
        nt.links.new(sep.outputs["Z"], ramp.inputs["Value"])
        self.mix = nt.nodes.new("ShaderNodeMix")
        self.mix.data_type = "RGBA"
        nt.links.new(ramp.outputs["Result"], self.mix.inputs[0])
        nt.links.new(self.mix.outputs[2], bg.inputs["Color"])
        nt.links.new(bg.outputs[0], out.inputs[0])
        self.bg = bg

        self.sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        self.sun.data.angle = math.radians(3.5)
        self.fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "AREA"))
        self.fill.data.size = 6
        self.fill.data.use_shadow = False if hasattr(self.fill.data, "use_shadow") else None
        for o in (self.sun, self.fill):
            s.collection.objects.link(o)

    def key(self, L, frame, room_x=0.0):
        d = v3(L["dir"]).normalized()
        self.sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        self.sun.data.color = mix_hex(L["sun"])
        self.sun.data.energy = 3.4 * L["sunI"]
        self.fill.location = Vector((room_x - 3.5, -7, 3.2))
        self.fill.rotation_euler = (Vector((room_x, 0, 0.9)) - self.fill.location).to_track_quat("-Z", "Y").to_euler()
        self.fill.data.energy = 500 * min(1.0, L["sunI"] / 1.6) + 150
        self.fill.data.color = (1.0, 0.965, 0.93)
        self.mix.inputs[6].default_value = (*mix_hex(L["ground"]), 1)
        self.mix.inputs[7].default_value = (*mix_hex(L["sky"]), 1)
        self.bg.inputs["Strength"].default_value = 0.4 * L["skyI"]
        bpy.context.scene.view_settings.exposure = math.log2(L["exposure"]) - 0.25
        for target, path in (
            (self.sun, "rotation_euler"),
            (self.sun.data, "color"),
            (self.sun.data, "energy"),
            (self.fill, "location"),
            (self.fill, "rotation_euler"),
            (self.fill.data, "energy"),
            (self.mix.inputs[6], "default_value"),
            (self.mix.inputs[7], "default_value"),
            (self.bg.inputs["Strength"], "default_value"),
        ):
            target.keyframe_insert(path, frame=frame)


# ── Camera ────────────────────────────────────────────────────────────
def make_camera():
    s = bpy.context.scene
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    s.collection.objects.link(cam)
    s.camera = cam
    cam.data.sensor_fit = "VERTICAL"
    cam.data.sensor_height = 24
    cam.data.clip_start = 0.05
    cam.data.clip_end = 120
    return cam


def key_camera(cam, c, frame, shift=0.0):
    pos, tgt = v3(c["pos"]), v3(c["target"])
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 12 / math.tan(math.radians(c["fov"]) / 2)
    cam.data.shift_x = shift
    cam.keyframe_insert("location", frame=frame)
    cam.keyframe_insert("rotation_euler", frame=frame)
    cam.data.keyframe_insert("lens", frame=frame)
