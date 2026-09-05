"""
Build a rigged, riding-posed rider GLB from Blender Studio's CC0 Human Base Meshes bundle.

  Blender -b human_base_meshes_bundle.blend --python build_rider.py -- male out/rider_male.glb presets.json thumbs_dir

Outputs a Draco-compressed GLB with: skinned body + eyes, face shape keys (morph targets), hair
styles / brows / beard shells, gear shells (jackets, gloves, elbow and knee guards, boots,
helmets), two single-frame clips ("Stand", "Ride"), and renders face / hair thumbnails.
"""
import bpy, bmesh, sys, json, math, os
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:]
GENDER, OUT, PRESETS, THUMBS = argv[0], argv[1], argv[2], argv[3]
presets = json.load(open(PRESETS))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
os.makedirs(THUMBS, exist_ok=True)

scene = bpy.context.scene
BODY_NAME = 'GEO-body_male_realistic' if GENDER == 'male' else 'GEO-body_female_realistic'
body = bpy.data.objects[BODY_NAME]
eyes = [o for o in bpy.data.objects if o.parent == body and o.type == 'MESH']

# ------------------------------------------------------------------ isolate + normalise ----
keep = {body.name, *[e.name for e in eyes]}
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
for o in [body] + eyes:
    if o.name not in scene.collection.objects:
        scene.collection.objects.link(o)
    o.hide_set(False); o.hide_viewport = False; o.hide_render = False

for o in [body] + eyes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for md in list(body.modifiers):
    body.modifiers.remove(md)

def sel(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]

sel([body] + eyes, body)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = [v.co for v in body.data.vertices]
cx = sum(v.x for v in vs) / len(vs)
minz = min(v.z for v in vs)
for o in [body] + eyes:
    for v in o.data.vertices:
        v.co.x -= cx; v.co.z -= minz
body.data.update()
for e in eyes: e.data.update()
body.name = 'Body'
eyes.sort(key=lambda e: -sum(v.co.x for v in e.data.vertices))
for e, nm in zip(eyes, ('Eye.L', 'Eye.R')):
    e.name = nm

verts = [v.co.copy() for v in body.data.vertices]
H = max(v.z for v in verts)
print(f'[rider] {GENDER}: height {H:.3f}')

def pts(z, h=0.025, pred=lambda v: True):
    return [v for v in verts if z - h <= v.z < z + h and pred(v)]
def centroid(ps):
    return sum(ps, Vector()) / len(ps) if ps else None
def halfwidth(z):
    return max(abs(v.x) for v in pts(z))

# landmarks
eyeL = [e for e in eyes if centroid([v.co for v in e.data.vertices]).x > 0][0]
eye_c = centroid([v.co for v in eyeL.data.vertices])
EYE_Z = eye_c.z
EYE_X = abs(eye_c.x)
head_pts = [v for v in verts if v.z > 0.9 * H]
HEAD_YMIN = min(v.y for v in head_pts)  # face front (nose tip)
HEAD_YMAX = max(v.y for v in head_pts)  # back of skull
HEAD_Y = (HEAD_YMIN + HEAD_YMAX) / 2
print(f'[rider] head y: front {HEAD_YMIN:.3f} centre {HEAD_Y:.3f} back {HEAD_YMAX:.3f}; eye z {EYE_Z:.3f} x {EYE_X:.3f}')
CHIN_Z = 0.887 * H
NECK_Z = 0.855 * H
SHOULDER_Z, ELBOW_Z, WRIST_Z, HANDTIP_Z = 0.83 * H, 0.645 * H, 0.535 * H, 0.445 * H
HIP_Z, KNEE_Z, ANKLE_Z, TOE_Z = 0.54 * H, 0.28 * H, 0.05 * H, 0.015 * H
WAIST_Z = 0.58 * H
CHEST_Z, SPINE_Z = 0.71 * H, 0.62 * H

def joint(z, side, minx):
    c = centroid(pts(z, 0.03, lambda v: side * v.x > minx))
    return c

J = {}
J['hips'] = Vector((0, centroid(pts(HIP_Z)).y, HIP_Z))
J['spine'] = Vector((0, centroid(pts(SPINE_Z)).y, SPINE_Z))
J['chest'] = Vector((0, centroid(pts(CHEST_Z)).y, CHEST_Z))
J['neck'] = Vector((0, centroid(pts(NECK_Z)).y, NECK_Z))
J['head'] = Vector((0, HEAD_Y, 0.885 * H))
J['head_top'] = Vector((0, HEAD_Y, H))
for s, L in ((1, 'L'), (-1, 'R')):
    hw = halfwidth(SHOULDER_Z)
    J[f'shoulder.{L}'] = Vector((s * hw * 0.86, centroid(pts(SHOULDER_Z, 0.03, lambda v: s * v.x > hw * 0.6)).y, SHOULDER_Z))
    J[f'elbow.{L}'] = joint(ELBOW_Z, s, 0.2)
    J[f'wrist.{L}'] = joint(WRIST_Z, s, 0.25)
    J[f'handtip.{L}'] = joint(HANDTIP_Z, s, 0.3)
    J[f'hip.{L}'] = Vector((s * 0.095 * H / 1.69, J['hips'].y, HIP_Z - 0.02))
    J[f'knee.{L}'] = joint(KNEE_Z, s, 0.02)
    J[f'ankle.{L}'] = centroid(pts(ANKLE_Z, 0.02, lambda v: s * v.x > 0.02 and v.y > -0.06))
    J[f'toe.{L}'] = centroid(pts(TOE_Z, 0.015, lambda v: s * v.x > 0.02 and v.y < -0.09))
    J[f'clav.{L}'] = Vector((s * 0.03, J['chest'].y, 0.80 * H))
for k, v in J.items():
    print(f'[rider] joint {k}: ({v.x:.3f}, {v.y:.3f}, {v.z:.3f})')

# ------------------------------------------------------------------ armature -----------
arm = bpy.data.armatures.new('RiderRig')
rig = bpy.data.objects.new('RiderRig', arm)
scene.collection.objects.link(rig)
sel([rig], rig)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None, connect=False, roll_to=Vector((0, -1, 0))):
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail = head, tail
    if parent:
        eb.parent = arm.edit_bones[parent]
        eb.use_connect = connect
    eb.align_roll(roll_to)
    return eb
bone('hips', J['hips'], J['spine'])
bone('spine', J['spine'], J['chest'], 'hips', True)
bone('chest', J['chest'], J['neck'], 'spine', True)
bone('neck', J['neck'], J['head'], 'chest', True)
bone('head', J['head'], J['head_top'], 'neck', True)
for L in ('L', 'R'):
    bone(f'shoulder.{L}', J[f'clav.{L}'], J[f'shoulder.{L}'], 'chest')
    bone(f'upper_arm.{L}', J[f'shoulder.{L}'], J[f'elbow.{L}'], f'shoulder.{L}', True)
    bone(f'forearm.{L}', J[f'elbow.{L}'], J[f'wrist.{L}'], f'upper_arm.{L}', True)
    bone(f'hand.{L}', J[f'wrist.{L}'], J[f'handtip.{L}'], f'forearm.{L}', True)
    bone(f'thigh.{L}', J[f'hip.{L}'], J[f'knee.{L}'], 'hips')
    bone(f'shin.{L}', J[f'knee.{L}'], J[f'ankle.{L}'], f'thigh.{L}', True)
    bone(f'foot.{L}', J[f'ankle.{L}'], J[f'toe.{L}'], f'shin.{L}', True, Vector((0, 0, 1)))
bpy.ops.object.mode_set(mode='OBJECT')

# auto weights
sel([body, rig], rig)
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
assert body.vertex_groups, 'auto weights failed'
print('[rider] auto weights ok, groups:', len(body.vertex_groups))

def rig_to(obj, group):
    """Attach a rigid object to one bone via a full-weight vertex group + armature modifier."""
    vg = obj.vertex_groups.new(name=group)
    vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    md = obj.modifiers.new('Armature', 'ARMATURE')
    md.object = rig
    obj.parent = rig
for e in eyes:
    rig_to(e, 'head')

# ------------------------------------------------------------------ materials ----------
def material(name, color, rough=0.6, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    m.diffuse_color = (*color, alpha)
    return m
def hexc(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
def lin(c):  # sRGB -> linear for node colours
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)
M = {
    'skin': material('skin', lin(hexc('#c8916a')), 0.55),
    'shirt': material('shirt', lin(hexc('#e8e3d6')), 0.9),
    'pants': material('pants', lin(hexc('#2b3a5a')), 0.95),
    'eye': material('eye', (0.9, 0.9, 0.9), 0.2),
    'hair': material('hair', lin(hexc('#2e1f16')), 0.7),
    'brow': material('brow', lin(hexc('#2e1f16')), 0.8),
    'beard': material('beard', lin(hexc('#2e1f16')), 0.85),
    'jacket': material('jacket', lin(hexc('#b8451c')), 0.7),
    'jacket_accent': material('jacket_accent', lin(hexc('#1f2226')), 0.5),
    'gloves': material('gloves', lin(hexc('#1f2226')), 0.7),
    'elbow': material('elbow', lin(hexc('#1f2226')), 0.5),
    'knee': material('knee', lin(hexc('#15171a')), 0.4),
    'boots': material('boots', lin(hexc('#1f2226')), 0.75),
    'helmet': material('helmet', lin(hexc('#15171a')), 0.3),
    'visor': material('visor', (0.02, 0.02, 0.03), 0.1, 0.0, 0.7),
}

# body face materials by region: skin / shirt / pants
body.data.materials.clear()
for name in ('skin', 'shirt', 'pants'):
    body.data.materials.append(M[name])
for e in eyes:
    e.data.materials.clear(); e.data.materials.append(M['eye'])
for p in body.data.polygons:
    c = sum((body.data.vertices[i].co for i in p.vertices), Vector()) / len(p.vertices)
    arm_region = abs(c.x) > 0.19 and c.z < SHOULDER_Z
    if WAIST_Z - 0.02 <= c.z <= NECK_Z + 0.01 and not (arm_region and c.z < ELBOW_Z + 0.06):
        p.material_index = 1  # shirt (short sleeves)
    elif ANKLE_Z + 0.05 <= c.z < WAIST_Z - 0.02 and not arm_region:
        p.material_index = 2  # pants
    else:
        p.material_index = 0
for p in body.data.polygons: p.use_smooth = True
for e in eyes:
    for p in e.data.polygons: p.use_smooth = True

# ------------------------------------------------------------------ face shape keys -----
sk_basis = body.shape_key_add(name='Basis')
def add_key(name, fn):
    k = body.shape_key_add(name=name, from_mix=False)
    for i, v in enumerate(body.data.vertices):
        d = fn(v.co)
        if d is not None:
            k.data[i].co = v.co + d
    return k
def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def bump(z, lo, hi):  # 1 in the middle of [lo,hi], 0 at the edges
    if z <= lo or z >= hi: return 0.0
    t = (z - lo) / (hi - lo); return math.sin(math.pi * t)
FACE_FRONT = HEAD_YMIN + 0.075
add_key('jaw_wide', lambda c: Vector((math.copysign(0.014 * bump(c.z, CHIN_Z - 0.03, EYE_Z - 0.02), c.x), 0, 0)) if c.z > CHIN_Z - 0.04 and abs(c.x) > 0.015 else None)
add_key('jaw_narrow', lambda c: Vector((-math.copysign(0.011 * bump(c.z, CHIN_Z - 0.03, EYE_Z - 0.01), c.x), 0, 0)) if c.z > CHIN_Z - 0.04 and abs(c.x) > 0.015 else None)
add_key('chin_long', lambda c: Vector((0, -0.003 * smooth((EYE_Z - 0.03 - c.z) / 0.06), -0.014 * smooth((EYE_Z - 0.03 - c.z) / 0.06))) if CHIN_Z - 0.05 < c.z < EYE_Z - 0.03 and c.y < HEAD_Y else None)
add_key('nose_big', lambda c: Vector((c.x * 0.25, -0.012, -0.003)) * bump(c.z, EYE_Z - 0.065, EYE_Z + 0.005) if abs(c.x) < 0.022 and c.y < HEAD_YMIN + 0.05 and EYE_Z - 0.07 < c.z < EYE_Z + 0.01 else None)
add_key('cheeks_full', lambda c: Vector((math.copysign(0.012, c.x), -0.006, -0.002)) * bump(c.z, EYE_Z - 0.06, EYE_Z + 0.0) * bump(abs(c.x), 0.025, 0.085) if c.y < HEAD_Y - 0.02 else None)
add_key('brow_heavy', lambda c: Vector((0, -0.008, -0.004)) * bump(c.z, EYE_Z + 0.005, EYE_Z + 0.05) if c.y < HEAD_YMIN + 0.06 and abs(c.x) < 0.07 else None)
body.active_shape_key_index = 0
print('[rider] shape keys:', [k.name for k in body.data.shape_keys.key_blocks])

# ------------------------------------------------------------------ region shells -------
def shell(name, pred, thickness, mat, min_frac=0.5, offset=1.0):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    doomed = []
    for f in bm.faces:
        inside = sum(1 for v in f.verts if pred(v.co))
        if inside / len(f.verts) < min_frac:
            doomed.append(f)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    if len(bm.faces) == 0:
        print('[rider] WARNING empty shell', name); bm.free(); return None
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    for vg in body.vertex_groups:
        obj.vertex_groups.new(name=vg.name)
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons: p.material_index = 0; p.use_smooth = True
    so = obj.modifiers.new('Solidify', 'SOLIDIFY')
    so.thickness = thickness; so.offset = offset; so.use_even_offset = False; so.use_rim = True
    sel([obj], obj)
    bpy.ops.object.modifier_apply(modifier='Solidify')
    ss = obj.modifiers.new('Subsurf', 'SUBSURF'); ss.levels = 1; ss.render_levels = 1
    bpy.ops.object.modifier_apply(modifier='Subsurf')
    for p in obj.data.polygons: p.use_smooth = True
    md = obj.modifiers.new('Armature', 'ARMATURE'); md.object = rig
    obj.parent = rig
    return obj

def join(objs, name):
    objs = [o for o in objs if o]
    if not objs: return None
    sel(objs, objs[0])
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o

def prim_sphere(name, center, radius, mat, group, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=20, ring_count=12, location=center)
    o = bpy.context.active_object
    o.name = name; o.scale = scale
    sel([o], o); bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    rig_to(o, group)
    return o

def prim_capsule(name, a, b, r, mat, group):
    d = b - a; L = d.length
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=L, vertices=14, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    sel([o], o); bpy.ops.object.transform_apply(rotation=True)
    o.name = name
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    rig_to(o, group)
    return o

M['iris'] = material('iris', (0.12, 0.06, 0.03), 0.25)
for e in eyes:
    ec = sum((v.co for v in e.data.vertices), Vector()) / len(e.data.vertices)
    prim_sphere('Iris' + e.name[3:], ec + Vector((0, -0.0118, 0)), 0.0062, M['iris'], 'head', (1, 0.35, 1))

is_scalp = lambda c: c.z > EYE_Z + 0.035 and (c.y > HEAD_Y - 0.01 or c.z > EYE_Z + 0.08) and (abs(c.x) < 0.072 or c.z > EYE_Z + 0.085)
is_face_front = lambda c: c.y < HEAD_YMIN + 0.075
# hair styles
hair = {}
hair['crop'] = shell('hair_crop', is_scalp, 0.012, M['hair'])
hair['buzz'] = shell('hair_buzz', is_scalp, 0.004, M['hair'])
side_cap = shell('hair_side_cap', is_scalp, 0.014, M['hair'])
side_fringe = shell('hair_side_fringe', lambda c: EYE_Z + 0.06 < c.z < EYE_Z + 0.09 and c.y < HEAD_Y - 0.03 and c.x > -0.02 and abs(c.x) < 0.07, 0.02, M['hair'])
hair['side'] = join([side_cap, side_fringe], 'hair_side')
quiff_cap = shell('hair_quiff_cap', is_scalp, 0.016, M['hair'])
quiff_top = shell('hair_quiff_top', lambda c: c.z > EYE_Z + 0.09 and c.y < HEAD_Y + 0.01, 0.04, M['hair'])
hair['quiff'] = join([quiff_cap, quiff_top], 'hair_quiff')
curly = shell('hair_curly', is_scalp, 0.03, M['hair'])
if curly:
    tex = bpy.data.textures.new('curl', 'CLOUDS'); tex.noise_scale = 0.03
    dm = curly.modifiers.new('Displace', 'DISPLACE'); dm.texture = tex; dm.strength = 0.018; dm.mid_level = 0.5
    sel([curly], curly); bpy.ops.object.modifier_apply(modifier='Displace')
hair['curly'] = curly
long_cap = shell('hair_long_cap', is_scalp, 0.014, M['hair'])
is_ear = lambda c: abs(c.x) > 0.066 and c.y < HEAD_Y + 0.055 and c.z > EYE_Z - 0.035
long_back = shell('hair_long_back', lambda c: NECK_Z - 0.2 < c.z <= EYE_Z + 0.04 and c.y > HEAD_Y + 0.03 and abs(c.x) < 0.13 and not is_ear(c), 0.026, M['hair'])
hair['long'] = join([long_cap, long_back], 'hair_long')
pony_cap = shell('hair_pony_cap', is_scalp, 0.014, M['hair'])
pony_tail = prim_capsule('hair_pony_tail', Vector((0, HEAD_YMAX + 0.01, EYE_Z + 0.03)), Vector((0, HEAD_YMAX + 0.06, NECK_Z - 0.16)), 0.028, M['hair'], 'head')
pony_knot = prim_sphere('hair_pony_knot', Vector((0, HEAD_YMAX + 0.005, EYE_Z + 0.035)), 0.04, M['hair'], 'head')
hair['ponytail'] = join([pony_cap, pony_tail, pony_knot], 'hair_ponytail')
bun_cap = shell('hair_bun_cap', is_scalp, 0.014, M['hair'])
bun = prim_sphere('hair_bun_ball', Vector((0, HEAD_YMAX + 0.01, EYE_Z + 0.075)), 0.05, M['hair'], 'head', (1, 0.9, 1))
hair['bun'] = join([bun_cap, bun], 'hair_bun')

brows = shell('brows', lambda c: EYE_Z + 0.02 < c.z < EYE_Z + 0.034 and 0.014 < abs(c.x) < 0.052 and c.y < HEAD_YMIN + 0.05, 0.003, M['brow'], 0.34)
def is_beard(c):
    if not (CHIN_Z - 0.035 < c.z < EYE_Z - 0.048 and c.y < HEAD_Y): return False
    mouth = abs(c.x) < 0.03 and CHIN_Z + 0.02 < c.z < CHIN_Z + 0.05 and c.y < HEAD_YMIN + 0.05
    return not mouth
beard_stubble = shell('beard_stubble', is_beard, 0.004, M['beard'], 0.5)
beard_full = shell('beard_full', is_beard, 0.014, M['beard'], 0.5)

# gear shells
is_arm = lambda c: abs(c.x) > 0.19 and c.z < SHOULDER_Z + 0.02
jacket_body = shell('jacket_body', lambda c: (WAIST_Z - 0.04 < c.z < NECK_Z + 0.02 and not is_arm(c)) or (is_arm(c) and c.z > WRIST_Z + 0.012), 0.014, M['jacket'])
jacket_collar = shell('jacket_collar', lambda c: NECK_Z - 0.01 < c.z < NECK_Z + 0.05, 0.022, M['jacket_accent'])
jacket = join([jacket_body, jacket_collar], 'gear_jacket')
cups = []
for L in ('L', 'R'):
    sx = 1 if L == 'L' else -1
    cups.append(prim_sphere(f'cup_sh_{L}', J[f'shoulder.{L}'] + Vector((sx * 0.012, 0, 0.03)), 0.052, M['jacket_accent'], f'upper_arm.{L}', (1.05, 0.9, 0.7)))
jacket_armour = join(cups, 'gear_jacket_armour')
back_plate = shell('gear_jacket_back', lambda c: WAIST_Z + 0.05 < c.z < NECK_Z - 0.04 and c.y > J['chest'].y + 0.03 and abs(c.x) < 0.13, 0.03, M['jacket_accent'])
gloves_short = shell('gear_gloves_short', lambda c: is_arm(c) and c.z < WRIST_Z + 0.012, 0.008, M['gloves'])
gloves_gauntlet = shell('gear_gloves_gauntlet', lambda c: is_arm(c) and c.z < WRIST_Z + 0.11, 0.011, M['gloves'])
elbows = []
for L in ('L', 'R'):
    elbows.append(prim_sphere(f'cup_el_{L}', J[f'elbow.{L}'] + Vector((0, 0.01, 0)), 0.052, M['elbow'], f'forearm.{L}', (0.9, 1.0, 1.15)))
elbow_guards = join(elbows, 'gear_elbow')
knee_soft = shell('gear_knee_soft', lambda c: abs(c.x) > 0.02 and KNEE_Z - 0.09 < c.z < KNEE_Z + 0.1 and abs(c.x) < 0.3, 0.012, M['knee'])
knee_pad = shell('gear_knee_pad', lambda c: abs(c.x) > 0.02 and KNEE_Z - 0.09 < c.z < KNEE_Z + 0.1 and abs(c.x) < 0.3, 0.016, M['knee'])
shin_pad = shell('gear_shin_pad', lambda c: abs(c.x) > 0.02 and ANKLE_Z + 0.12 < c.z <= KNEE_Z - 0.09 and abs(c.x) < 0.3 and c.y < J['knee.L'].y + 0.01, 0.016, M['knee'])
knee_shell = join([knee_pad, shin_pad], 'gear_knee_shell')
is_foot = lambda c: abs(c.x) > 0.02 and abs(c.x) < 0.3
boots_sneaker = shell('gear_boots_sneaker', lambda c: is_foot(c) and c.z < ANKLE_Z + 0.05, 0.012, M['boots'])
boots_ankle = shell('gear_boots_ankle', lambda c: is_foot(c) and c.z < ANKLE_Z + 0.13, 0.012, M['boots'])
boots_tall = shell('gear_boots_tall', lambda c: is_foot(c) and c.z < ANKLE_Z + 0.33, 0.014, M['boots'])
is_head = lambda c: c.z > CHIN_Z - 0.005 and not (c.y > HEAD_Y + 0.02 and c.z < NECK_Z + 0.03)
helmet_open_shell = shell('gear_helmet_open_shell', lambda c: is_head(c) and c.z > CHIN_Z + 0.03 and not (is_face_front(c) and c.z < EYE_Z + 0.055) and not is_ear(c), 0.046, M['helmet'])
def prim_box(name, center, size, mat, group, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.name = name; o.scale = size; o.rotation_euler = rot
    sel([o], o); bpy.ops.object.transform_apply(scale=True, rotation=True)
    o.data.materials.append(mat)
    rig_to(o, group)
    return o
peak = prim_box('gear_helmet_peak', Vector((0, HEAD_YMIN - 0.03, EYE_Z + 0.075)), (0.22, 0.1, 0.012), M['jacket_accent'], 'head', (math.radians(-22), 0, 0))
helmet_open = join([helmet_open_shell, peak], 'gear_helmet_open')
helmet_full = shell('gear_helmet_full', lambda c: is_head(c) and not (is_face_front(c) and EYE_Z - 0.032 < c.z < EYE_Z + 0.04) and not is_ear(c), 0.046, M['helmet'])
helmet_visor = shell('gear_helmet_visor', lambda c: is_face_front(c) and EYE_Z - 0.04 < c.z < EYE_Z + 0.05 and c.z > CHIN_Z, 0.05, M['visor'])

# ------------------------------------------------------------------ poses ----------------
sel([rig], rig)
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = 'XYZ'
def set_pose(rot):
    for b in pb:
        b.rotation_euler = Euler((0, 0, 0))
    for name, (x, y, z) in rot.items():
        pb[name].rotation_euler = Euler((math.radians(x), math.radians(y), math.radians(z)))
RIDE = {
    'hips': (16, 0, 0), 'spine': (6, 0, 0), 'chest': (4, 0, 0), 'neck': (-16, 0, 0), 'head': (-10, 0, 0),
}
for s, L in ((1, 'L'), (-1, 'R')):
    RIDE[f'upper_arm.{L}'] = (72, 0, -s * 4)
    RIDE[f'forearm.{L}'] = (14, 0, 0)
    RIDE[f'hand.{L}'] = (-20, 0, 0)
    RIDE[f'thigh.{L}'] = (78, 0, s * 4)
    RIDE[f'shin.{L}'] = (-95, 0, 0)
    RIDE[f'foot.{L}'] = (20, 0, 0)
def keyframe_action(name, rot):
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    set_pose(rot)
    for b in pb:
        b.keyframe_insert('rotation_euler', frame=1)
        b.keyframe_insert('location', frame=1)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, act)
    rig.animation_data.action = None
    return act
keyframe_action('Stand', {})
keyframe_action('Ride', RIDE)
set_pose({})
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ export ---------------
for o in bpy.data.objects:
    o.hide_set(False); o.hide_render = False; o.hide_viewport = False
print('[rider] objects:', sorted(o.name for o in bpy.data.objects))
sel(list(bpy.data.objects), rig)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_apply=True, export_skins=True, export_morph=True, export_morph_normal=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_yup=True, export_texcoords=False, export_normals=True, export_materials='EXPORT',
    export_def_bones=False, export_rest_position_armature=True,
)
print('[rider] exported', OUT, os.path.getsize(OUT))

# ------------------------------------------------------------------ thumbnails -----------
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_cavity = True
scene.display.render_aa = '8'
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
scene.camera = cam
for t in rig.animation_data.nla_tracks: t.mute = True
scene.frame_set(1)
cam_data.lens = 70
head_c = Vector((0, HEAD_Y, EYE_Z - 0.04))
cam.location = head_c + Vector((0.2, -0.8, 0.06))
cam.rotation_mode = 'QUATERNION'
cam.rotation_quaternion = (head_c - cam.location).to_track_quat('-Z', 'Y')
all_hair = [o for o in hair.values() if o]
gear_objs = [o for o in bpy.data.objects if o.name.startswith('gear_')]
for o in gear_objs + [beard_stubble, beard_full]:
    if o: o.hide_render = True
def render(path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
default_hair = hair['crop'] if GENDER == 'male' else hair['long']
for o in all_hair: o.hide_render = o is not default_hair
for f in presets['faces'][GENDER]:
    for k in body.data.shape_keys.key_blocks:
        k.value = f['morphs'].get(k.name, 0.0)
    render(os.path.join(THUMBS, f'face_{GENDER}_{f["id"]}.png'))
for k in body.data.shape_keys.key_blocks: k.value = 0.0
for hid in presets['hair'][GENDER]:
    for o in all_hair: o.hide_render = True
    if hid != 'bald' and hair.get(hid): hair[hid].hide_render = False
    render(os.path.join(THUMBS, f'hair_{GENDER}_{hid}.png'))
print('[rider] done')
