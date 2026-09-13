"""
Build a rigged, riding-posed rider GLB from Blender Studio's CC0 Human Base Meshes bundle.

  Blender -b human_base_meshes_bundle.blend --python build_rider.py -- male out/rider_male.glb presets.json thumbs_dir

Outputs a Draco-compressed GLB with: skinned body (baked skin albedo + roughness textures), eyes
(sclera, iris, cornea, lashes), Indian-centred face shape keys (morph targets, also carried by
the brow, lash, kajal and beard shells), hair styles, turban, accents (bindi, earrings), gear
shells (jackets, gloves, elbow and knee guards, boots, helmets), two single-frame clips ("Stand",
"Ride"), and renders face / hair thumbnails with EEVEE.

The work is split into modules executed with the builder's globals:
  rider_face.py      morph fields, skin bake, eyes, lashes, kajal, brows, beards, accents
  rider_wardrobe.py  riding gear fitted to the body
  rider_hair.py      hairline, hair volumes, braid, ponytail, bun, turban
  rider_thumbs.py    EEVEE thumbnails

Env: RIDER_SCRATCH  directory for baked textures (default: <out dir>/.rider-bake)
"""
import bpy, bmesh, sys, json, math, os, runpy
from mathutils import Vector, Euler, Matrix
from mathutils.kdtree import KDTree

argv = sys.argv[sys.argv.index('--') + 1:]
GENDER, OUT, PRESETS, THUMBS = argv[0], argv[1], argv[2], argv[3]
presets = json.load(open(PRESETS))
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
os.makedirs(THUMBS, exist_ok=True)
SCRATCH = os.environ.get('RIDER_SCRATCH', os.path.join(os.path.dirname(OUT) or '.', '.rider-bake'))
os.makedirs(SCRATCH, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))

scene = bpy.context.scene
BODY_NAME = 'GEO-body_male_realistic' if GENDER == 'male' else 'GEO-body_female_realistic'
body = bpy.data.objects[BODY_NAME]
bundle_eyes = [o for o in bpy.data.objects if o.parent == body and o.type == 'MESH']

# The bundle eyes carry a parent-inverse matrix and a rotation that the glTF exporter ignores for
# skinned parts but Blender honours, which displaced the female thumbnails. Measure them in world
# space, then discard them; rider_face.py builds our own eyes at the measured centres.
def world_centroid(o):
    return sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
EYE_WORLD = {}
EYE_R = 0.012
for e in bundle_eyes:
    c = world_centroid(e)
    zs = [(e.matrix_world @ v.co).z for v in e.data.vertices]
    EYE_R = (max(zs) - min(zs)) / 2
    EYE_WORLD['L' if c.x > body.matrix_world.translation.x else 'R'] = c
assert len(EYE_WORLD) == 2, 'expected two bundle eyes'

# ------------------------------------------------------------------ isolate + normalise ----
for o in list(bpy.data.objects):
    if o.name != body.name:
        bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
if body.name not in scene.collection.objects:
    scene.collection.objects.link(body)
body.hide_set(False); body.hide_viewport = False; body.hide_render = False
body.parent = None
for md in list(body.modifiers):
    body.modifiers.remove(md)
# Refine the base before creating morphs so the face and every expression share topology.
bpy.context.view_layer.objects.active = body
sub = body.modifiers.new('Face topology', 'SUBSURF')
sub.levels = 1
bpy.ops.object.modifier_apply(modifier=sub.name)

def sel(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]

sel([body], body)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = [v.co for v in body.data.vertices]
cx = sum(v.x for v in vs) / len(vs)
minz = min(v.z for v in vs)
SHIFT = Vector((cx, 0, minz))
for v in body.data.vertices:
    v.co -= SHIFT
body.data.update()
body.name = 'Body'
EYE_C = {k: c - SHIFT for k, c in EYE_WORLD.items()}

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
eye_c = EYE_C['L']
EYE_Z = eye_c.z
EYE_X = abs(eye_c.x)
EYE_Y = eye_c.y
head_pts = [v for v in verts if v.z > 0.9 * H]
HEAD_YMIN = min(v.y for v in head_pts)  # face front (nose tip)
HEAD_YMAX = max(v.y for v in head_pts)  # back of skull
HEAD_Y = (HEAD_YMIN + HEAD_YMAX) / 2
print(f'[rider] head y: front {HEAD_YMIN:.3f} centre {HEAD_Y:.3f} back {HEAD_YMAX:.3f}; eye z {EYE_Z:.3f} x {EYE_X:.3f} y {EYE_Y:.3f} r {EYE_R:.4f}')
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
    vg = obj.vertex_groups.get(group) or obj.vertex_groups.new(name=group)
    vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    md = obj.modifiers.new('Armature', 'ARMATURE')
    md.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse.identity()

# Body KDTree + normals, shared by the face, wardrobe and hair modules.
tree = KDTree(len(body.data.vertices))
for v in body.data.vertices:
    tree.insert(v.co, v.index)
tree.balance()
body_normal = [v.normal.copy() for v in body.data.vertices]

def skin_offset(p, clearance):
    """Move p so it sits at least `clearance` outside the nearest body vertex along its normal."""
    co, idx, d = tree.find(p)
    n = body_normal[idx]
    h = (p - co).dot(n)
    if h < clearance:
        p = p + n * (clearance - h)
    return p

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
        m.surface_render_method = 'DITHERED'
    m.diffuse_color = (*color, alpha)
    return m
def hexc(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
def lin(c):  # sRGB -> linear for node colours
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)
SKIN_DEFAULT = next((s['hex'] for s in presets['skinTones'] if s['id'] == 's3'), '#bb885c')
M = {
    'skin': material('skin', lin(hexc(SKIN_DEFAULT)), 0.55),
    'shirt': material('shirt', lin(hexc('#e8e3d6')), 0.9),
    'pants': material('pants', lin(hexc('#2b3a5a')), 0.95),
    'hair': material('hair', lin(hexc('#15110f')), 0.7),
    'brow': material('brow', lin(hexc('#15110f')), 0.8),
    'beard': material('beard', lin(hexc('#15110f')), 0.85),
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
for part in ('skin_feet', 'skin_hands', 'skin_arms'):
    M[part] = material(part, lin(hexc(SKIN_DEFAULT)), .78)
for name in ('skin', 'shirt', 'pants', 'skin_feet', 'skin_hands', 'skin_arms'):
    body.data.materials.append(M[name])
for p in body.data.polygons:
    c = sum((body.data.vertices[i].co for i in p.vertices), Vector()) / len(p.vertices)
    arm_region = abs(c.x) > 0.19 and HANDTIP_Z - .03 < c.z < SHOULDER_Z
    if c.z < ANKLE_Z + .06:
        p.material_index = 3
    elif arm_region and c.z < WRIST_Z + .01:
        p.material_index = 4
    elif arm_region and c.z < ELBOW_Z + .06:
        p.material_index = 5
    elif WAIST_Z - 0.02 <= c.z <= NECK_Z + 0.01:
        p.material_index = 1  # shirt (short sleeves)
    elif ANKLE_Z + 0.05 <= c.z < WAIST_Z - 0.02 and not arm_region:
        p.material_index = 2  # pants
    else:
        p.material_index = 0
for p in body.data.polygons: p.use_smooth = True

# ------------------------------------------------------------------ shared helpers ------
def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def bump(z, lo, hi):  # 1 in the middle of [lo,hi], 0 at the edges
    if z <= lo or z >= hi: return 0.0
    t = (z - lo) / (hi - lo); return math.sin(math.pi * t)

# Fields are authored in anatomical mm; the new Indian-feature fields read stronger at game scale,
# the legacy jaw / cheek / brow fields were already tuned at full strength.
MORPH_GAIN = {'jaw_wide': 1.0, 'jaw_narrow': 1.0, 'cheeks_full': 1.0, 'brow_heavy': 1.0}
def add_field_keys(obj, fields):
    """Shape keys from analytic displacement fields fn(co) -> Vector | None. Any mesh that gets the
    same key names follows the face at runtime (Rider.ts drives every morph dictionary)."""
    if not obj or obj.type != 'MESH':
        return
    if not obj.data.shape_keys:
        obj.shape_key_add(name='Basis')
    for name, fn in fields.items():
        k = obj.shape_key_add(name=name, from_mix=False)
        k.slider_min = -1.0
        gain = MORPH_GAIN.get(name, 1.4)
        for i, v in enumerate(obj.data.vertices):
            d = fn(v.co)
            if d is not None:
                k.data[i].co = v.co + d * gain
    obj.active_shape_key_index = 0

def shell(name, pred, thickness, mat, min_frac=0.5, offset=1.0):
    """Copy of the body faces selected by pred, solidified outward, skinned like the body."""
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
    for p in obj.data.polygons: p.use_smooth = True
    md = obj.modifiers.new('Armature', 'ARMATURE'); md.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse.identity()
    return obj

def join(objs, name):
    objs = [o for o in objs if o]
    if not objs: return None
    sel(objs, objs[0])
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o

def prim_sphere(name, center, radius, mat, group, scale=(1, 1, 1), segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments, ring_count=rings, location=center)
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

def eye_distance(c):
    return min((c - EYE_C['L']).length, (c - EYE_C['R']).length)

is_face_front = lambda c: c.y < HEAD_YMIN + 0.075
is_arm = lambda c: abs(c.x) > 0.19 and HANDTIP_Z - .07 < c.z < SHOULDER_Z + 0.02

# ------------------------------------------------------------------ modules -------------
def run_module(name):
    runpy.run_path(os.path.join(HERE, name), init_globals=globals())

# Face first (morphs, skin bake, eyes, brows, beards, accents), then the wardrobe, then hair,
# which reuses the wardrobe's strip() / wrap() / weighted() helpers.
face_globals = runpy.run_path(os.path.join(HERE, 'rider_face.py'), init_globals=globals())
MORPHS = face_globals['MORPHS']
for k in ('is_brow', 'is_beard', 'gauss'):
    globals()[k] = face_globals[k]
ward_globals = runpy.run_path(os.path.join(HERE, 'rider_wardrobe.py'), init_globals=globals())
for k in ('strip', 'wrap', 'weighted', 'mesh_part', 'recalc', 'table', 'smoothstep', 'frame',
          'sector_radii', 'box', 'subdivide', 'rim_z', 'helmet_point', 'TAU'):
    globals()[k] = ward_globals[k]
hair_globals = runpy.run_path(os.path.join(HERE, 'rider_hair.py'), init_globals=globals())
hair_parts = hair_globals['hair_parts']

def assert_eyes_in_socket():
    """Guard for the thumbnail / export pipeline: every eye part must sit at its measured centre.
    (Positions are checked on the authored mesh; skinning keeps them attached to the head.)"""
    for side in ('L', 'R'):
        for prefix in ('Eye', 'Iris', 'Cornea'):
            o = bpy.data.objects.get(f'{prefix}.{side}')
            if not o: continue
            c = sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
            off = (c - EYE_C[side]).length
            limit = 0.004 if prefix == 'Eye' else 0.014  # iris and cornea sit on the front of the eye
            assert off < limit, f'{o.name} sits {off * 1000:.1f} mm from the socket'
            assert o.parent == rig and o.matrix_parent_inverse.is_identity, f'{o.name} parenting'
    print('[rider] eyes in sockets ok')

def dump_parts():
    for o in sorted(bpy.data.objects, key=lambda o: o.name):
        if o.type != 'MESH' or o.name.startswith('gear_'): continue
        c = sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / max(len(o.data.vertices), 1)
        print(f'[rider] part {o.name}: verts {len(o.data.vertices)} at ({c.x:.3f}, {c.y:.3f}, {c.z:.3f}) '
              f'mats {[m.name for m in o.data.materials]} parent {o.parent and o.parent.name} mods {[m.type for m in o.modifiers]}')

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
dump_parts()
assert_eyes_in_socket()
sel(list(bpy.data.objects), rig)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_apply=True, export_skins=True, export_morph=True, export_morph_normal=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
    export_image_format='JPEG', export_jpeg_quality=90, export_vertex_color='NONE',
    export_def_bones=False, export_rest_position_armature=True,
)
size = os.path.getsize(OUT)
print('[rider] exported', OUT, size)
assert size < 4.6e6, f'GLB over budget: {size} bytes'

# ------------------------------------------------------------------ thumbnails -----------
run_module('rider_thumbs.py')
print('[rider] done')
