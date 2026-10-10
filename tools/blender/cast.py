"""The hero's people: Rain (Blender Studio, CC-BY) as the customer, and variants of her for the staff.

Credit required on the site: "Rain Rig (CC) Blender Foundation | studio.blender.org".
Poses come from the web hero's figures (frames.json): the torso and head copy their joint rotations,
hands and feet go to the same world positions through the rig's IK, so contacts stay where the
web layout put them. Rain's arms are shorter than the web figure's, so each scene can move a person
(`shift`) and their hand targets (`hands`) to keep contacts in reach.
"""
import math

import bpy
from mathutils import Matrix, Vector

from lib import RAIN_BLEND, hex_rgb, q3, v3

# Looks per role. Colours are sRGB hex; `pieces` lists the hair pieces that stay.
CUSTOMER = {
    "top": "#b2563d",
    "bottom": "#2f2e33",
    "hair": "#2a211d",
    "band": "#3a2e28",
    "shoes": "#e9e2d8",
    "skin": None,
    "pieces": {"hair_main", "hair_ponytail", "hair_strand", "hairband"},
    "scarf": False,
}
TECH = {
    "top": "#ece8e2",
    "bottom": "#d8d2ca",
    "hair": "#1b1715",
    "band": "#1b1715",
    "shoes": "#3a3633",
    "skin": (0.78, 0.7, 0.64),
    "pieces": {"hair_main", "hairband"},
    "scarf": False,
}


def append_rain():
    before = set(bpy.data.objects)
    with bpy.data.libraries.load(str(RAIN_BLEND), link=False) as (src, dst):
        dst.collections = ["CH-rain"]
    col = dst.collections[0]
    bpy.context.scene.collection.children.link(col)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.name.startswith(("WGT-", "HLP-")) or "viewport" in o.name or "nomask" in o.name:
            o.hide_render = True
            o.hide_viewport = True
    rig = next(o for o in new if o.type == "ARMATURE")
    return rig, [o for o in new if o.type == "MESH" and o.name.startswith("GEO-")]


def _part(o):
    return o.name.split("GEO-rain-", 1)[1].split(".")[0]


def _bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _tint(m, color, mean):
    """Recolour a material while keeping its texture detail: colour x (luminance / mean)."""
    nt = m.node_tree
    sock = _bsdf(m).inputs["Base Color"]
    if not sock.is_linked:
        sock.default_value = (*color, 1)
        return
    src = sock.links[0].from_socket
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(src, bw.inputs[0])
    div = nt.nodes.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = mean
    nt.links.new(bw.outputs[0], div.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = (*color, 1)
    nt.links.new(div.outputs[0], mix.inputs[7])
    nt.links.new(mix.outputs[2], sock)


def _scale(m, factor):
    """Multiply a material's base colour (skin tone shifts)."""
    nt = m.node_tree
    sock = _bsdf(m).inputs["Base Color"]
    if not sock.is_linked:
        sock.default_value = (*[a * b for a, b in zip(sock.default_value[:3], factor)], 1)
        return
    src = sock.links[0].from_socket
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (*factor, 1)
    nt.links.new(src, mix.inputs[6])
    nt.links.new(mix.outputs[2], sock)


MEANS = {"top": 0.95, "jeans": 0.22, "hair": 0.09, "band": 0.5, "shoes": 0.4}


def dress(rig, meshes, look):
    """Recolour per role and remove the pieces the role doesn't wear. Returns the meshes that stay."""
    rig.pose.bones["Properties_Character_Rain"]["Scarf"] = look["scarf"]
    copies = {}
    kept = []

    def own(slot):
        m = slot.material
        if m.name not in copies:
            copies[m.name] = m.copy()
        slot.material = copies[m.name]
        return slot.material

    for o in meshes:
        part = _part(o)
        if ((part.startswith("hair") or part == "hairband") and part not in look["pieces"]) or (part == "scarf" and not look["scarf"]) or o.hide_render:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        kept.append(o)
        for slot in o.material_slots:
            if not slot.material:
                continue
            name = slot.material.name.split("MAT-rain.", 1)[-1].split(".")[0]
            if part == "top" and name == "top":
                _tint(own(slot), hex_rgb(look["top"]), MEANS["top"])
            elif part == "jeans" and name == "jeans":
                _tint(own(slot), hex_rgb(look["bottom"]), MEANS["jeans"])
            elif part.startswith("hair") and name == "hair":
                _tint(own(slot), hex_rgb(look["hair"]), MEANS["hair"])
            elif part == "hairband":
                _tint(own(slot), hex_rgb(look["band"]), MEANS["band"])
            elif part == "shoes" and name == "shoes":
                _tint(own(slot), hex_rgb(look["shoes"]), MEANS["shoes"])
            elif look["skin"] and name in ("body", "hands"):
                _scale(own(slot), look["skin"])
    return kept


# ── Posing ────────────────────────────────────────────────────────────
# Rain's T-pose hands point along +-X with the palm down; the web figure's rest hand hangs with the
# palm to the thigh. These turn one into the other.
HAND_REST = {"L": Matrix.Rotation(math.radians(90), 3, "Y"), "R": Matrix.Rotation(math.radians(-90), 3, "Y")}

TORSO = [
    ("FK-Spine", "spine"),
    ("FK-RibCage", ("spine", "chest")),
    ("FK-Chest", "chest"),
    ("FK-Neck", "neck"),
    ("FK-Head", "head"),
]
PONYTAIL = ["FK-Hair_Ponytail2", "FK-Hair_Ponytail3", "FK-Hair_Ponytail4"]


class Actor:
    def __init__(self, rig, meshes, look, shift=(0, 0, 0), hands=(0, 0, 0), sit_drop=0.0, lean=1.0, elbows_down=0.0, curls=None):
        self.rig = rig
        self.meshes = dress(rig, meshes, look)
        self.shift = Vector(shift)
        self.hands = Vector(hands)
        self.sit_drop = sit_drop
        self.lean = lean
        self.elbows_down = elbows_down
        self.curls = curls or {}
        # Lids follow the gaze, so looking down at the hands reads as looking down, not as white eyes.
        rig.pose.bones["Properties_Face"]["sticky_eyelids"] = 0.8
        # The eye target switches parents through an Armature constraint; world placement needs it off.
        for c in rig.pose.bones["TGT-Eyes"].constraints:
            c.mute = True
        props = rig.pose.bones["Properties_IKFK"]
        for k, v in {"ik_spine": 0.0, "ik_stretch_arms": 0.0, "ik_stretch_legs": 0.0, "ik_fingers_left": 0.0, "ik_fingers_right": 0.0,
                     "ik_pole_follow_feet": 0.0, "ik_pole_follow_hands": 0.0}.items():
            props[k] = v
        for b in rig.pose.bones:
            b.location = (0, 0, 0)
            b.rotation_quaternion = (1, 0, 0, 0)
            b.rotation_euler = (0, 0, 0)

    def _put(self, name, rot, loc=None):
        pb = self.rig.pose.bones[name]
        rest = pb.bone.matrix_local.to_3x3()
        head = loc if loc is not None else pb.matrix.translation
        pb.matrix = Matrix.LocRotScale(head, (rot @ rest).to_quaternion(), Vector((1, 1, 1)))
        bpy.context.view_layer.update()
        return pb

    def _aim(self, name, direction):
        """Turn a bone (keeping its head) so it points along a world direction."""
        pb = self.rig.pose.bones[name]
        m = pb.matrix.copy()
        turn = Vector(m.col[1][:3]).rotation_difference(direction.normalized())
        pb.matrix = Matrix.LocRotScale(m.translation, (turn.to_matrix() @ m.to_3x3()).to_quaternion(), Vector((1, 1, 1)))
        bpy.context.view_layer.update()
        return pb

    def _key(self, pb, frame):
        pb.keyframe_insert("location", frame=frame)
        path = "rotation_quaternion" if pb.rotation_mode == "QUATERNION" else "rotation_euler"
        pb.keyframe_insert(path, frame=frame)

    def pose(self, c, frame, look=None):
        J = c["joints"]
        rot = {k: q3(v[3:]).to_matrix() for k, v in J.items()}
        pos = {k: v3(v[:3]) + self.shift for k, v in J.items()}
        self.visible(c["visible"], frame)
        touched = [self._put("MSTR-Pelvis", rot["root"], pos["root"] + Vector((0, 0, -self.sit_drop)))]
        q_root = q3(J["root"][3:])
        for bone, j in TORSO:
            q = q3(J[j[0]][3:]).slerp(q3(J[j[1]][3:]), 0.5) if isinstance(j, tuple) else q3(J[j][3:])
            touched.append(self._put(bone, q_root.slerp(q, self.lean).to_matrix()))
        for s, side in (("l", "L"), ("r", "R")):
            sh, el, wr = pos[f"{s}Sh"], pos[f"{s}El"], pos[f"{s}Wr"] + self.hands
            pole = el + ((el - (sh + wr) / 2).normalized() + Vector((0, 0, -self.elbows_down))).normalized() * 0.45
            touched.append(self._put(f"IK-Pole-Forearm.{side}", Matrix.Identity(3), pole))
            touched.append(self._put(f"IK-Hand.{side}", rot[f"{s}Wr"] @ HAND_REST[side], wr))
            hp, kn, an = pos[f"{s}Hip"], pos[f"{s}Kn"], pos[f"{s}An"]
            kpole = kn + (kn - (hp + an) / 2).normalized() * 0.5
            touched.append(self._put(f"IK-Pole-Shin.{side}", Matrix.Identity(3), kpole))
            touched.append(self._put(f"MSTR-Foot.{side}", rot[f"{s}An"], an + Vector((0, 0, -0.008))))
        for bone, deg in self.curls.items():
            pb = self.rig.pose.bones.get(bone)
            if pb:
                pb.rotation_mode = "XYZ"
                pb.rotation_euler = (math.radians(deg), 0, 0)
                touched.append(pb)
        if look is not None:
            touched.append(self._put("TGT-Eyes", Matrix.Identity(3), look))
        if "FK-Hair_Ponytail2" in self.rig.pose.bones and any(o.name.startswith("GEO-rain-hair_ponytail") for o in self.meshes):
            # The ponytail hangs: a little back from the head, mostly down.
            back = (rot["head"] @ Vector((0, 1, 0))).normalized()
            for bone, w in zip(PONYTAIL, (1.1, 0.45, 0.2)):
                touched.append(self._aim(bone, back * w + Vector((0, 0, -1))))
        for pb in touched:
            self._key(pb, frame)

    def visible(self, on, frame):
        for o in self.meshes:
            o.hide_render = not on
            o.keyframe_insert("hide_render", frame=frame)


def curl(side, fingers=("Index", "Middle", "Ring", "Pinky"), a=(20, 25, 15), thumb=None):
    out = {}
    for f in fingers:
        for i, deg in enumerate(a, 1):
            out[f"FK-{f}{i}.{side}"] = deg
    if thumb:
        for i, deg in enumerate(thumb, 1):
            out[f"FK-Thumb{i}.{side}"] = deg
    return out
