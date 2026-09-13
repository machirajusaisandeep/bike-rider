"""Face module, executed by build_rider.py with its landmarks, rig and helpers.

Indian-centred face morph fields (shape keys shared by the body and every shell that sits on the
face), a baked skin albedo / roughness texture with warm undertones and periorbital shading,
proper eyes (sclera, iris, cornea, lashes), kajal, arched brows, beards, and the bindi / earring
accents. Metres, Blender Z up / -Y forward.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

R = EYE_R
FACE_Y = HEAD_YMIN + 0.075

def sgn(v): return 1.0 if v >= 0 else -1.0
def nearest_eye(c): return EYE_C['L'] if c.x >= 0 else EYE_C['R']
def de(c): return (c - nearest_eye(c)).length
def gauss(v, s): return math.exp(-(v / s) ** 2)

def tangent_to_eye(c, d):
    """Remove the component of d that points into the eyeball, so lids slide over it."""
    r = c - nearest_eye(c)
    L = r.length
    if 1e-6 < L < R + 0.004:
        n = r / L
        k = d.dot(n)
        if k < 0: d = d - n * k
    return d

# ------------------------------------------------------------------ morph fields ---------
def f_face_round(c):
    if not (CHIN_Z - 0.02 < c.z < EYE_Z + 0.01 and c.y < HEAD_Y and abs(c.x) > 0.02): return None
    k = bump(c.z, CHIN_Z - 0.02, EYE_Z + 0.01) * bump(abs(c.x), 0.02, 0.09)
    return Vector((sgn(c.x) * 0.010, -0.004, 0)) * k

def f_face_long(c):
    if not (CHIN_Z - 0.05 < c.z < EYE_Z - 0.02 and c.y < HEAD_Y): return None
    k = smooth((EYE_Z - 0.02 - c.z) / 0.09)
    return Vector((-c.x * 0.10, -0.002, -0.012)) * k

def f_jaw_wide(c):
    if not (c.z > CHIN_Z - 0.04 and abs(c.x) > 0.015 and c.y < HEAD_Y + 0.02): return None
    return Vector((sgn(c.x) * 0.014 * bump(c.z, CHIN_Z - 0.03, EYE_Z - 0.02), 0, 0))

def f_jaw_narrow(c):
    if not (c.z > CHIN_Z - 0.04 and abs(c.x) > 0.015 and c.y < HEAD_Y + 0.02): return None
    return Vector((-sgn(c.x) * 0.011 * bump(c.z, CHIN_Z - 0.03, EYE_Z - 0.01), 0, 0))

def f_cheekbones_high(c):
    if not (EYE_Z - 0.035 < c.z < EYE_Z - 0.005 and 0.038 < abs(c.x) < 0.072 and c.y < HEAD_Y - 0.02): return None
    k = bump(c.z, EYE_Z - 0.035, EYE_Z - 0.005) * bump(abs(c.x), 0.038, 0.072)
    return Vector((sgn(c.x) * 0.005, -0.004, 0.002)) * k

def f_cheeks_full(c):
    if not (c.y < HEAD_Y - 0.02): return None
    k = bump(c.z, EYE_Z - 0.06, EYE_Z) * bump(abs(c.x), 0.025, 0.085)
    if k <= 0: return None
    return Vector((sgn(c.x) * 0.012, -0.006, -0.002)) * k

def f_brow_heavy(c):
    if not (c.y < HEAD_YMIN + 0.06 and abs(c.x) < 0.07): return None
    k = bump(c.z, EYE_Z + 0.005, EYE_Z + 0.05)
    if k <= 0: return None
    return tangent_to_eye(c, Vector((0, -0.008, -0.004)) * k)

def f_nose_broad(c):
    if not (abs(c.x) < 0.024 and c.y < HEAD_YMIN + 0.045 and EYE_Z - 0.07 < c.z < EYE_Z - 0.03): return None
    k = bump(c.z, EYE_Z - 0.07, EYE_Z - 0.03)
    return Vector((sgn(c.x) * 0.0045 * bump(abs(c.x), 0.004, 0.024), -0.0015, -0.001)) * k

def f_nose_bridge(c):
    if not (abs(c.x) < 0.012 and c.y < HEAD_YMIN + 0.03 and EYE_Z - 0.035 < c.z < EYE_Z + 0.02): return None
    k = bump(c.z, EYE_Z - 0.035, EYE_Z + 0.02)
    return Vector((-c.x * 0.15, -0.0035, 0)) * k

def f_nose_tip_down(c):
    if not (abs(c.x) < 0.016 and c.y < HEAD_YMIN + 0.03 and EYE_Z - 0.075 < c.z < EYE_Z - 0.04): return None
    k = bump(c.z, EYE_Z - 0.075, EYE_Z - 0.04)
    return Vector((0, -0.0015, -0.0045)) * k

LIP_Z = CHIN_Z + 0.034
def f_lips_full(c):
    if not (abs(c.x) < 0.032 and c.y < HEAD_YMIN + 0.05 and CHIN_Z + 0.018 < c.z < CHIN_Z + 0.052): return None
    g = gauss(c.z - LIP_Z, 0.011) * (1 - (abs(c.x) / 0.032) ** 2)
    return Vector((0, -0.0035 * g, 0.0015 * sgn(c.z - LIP_Z) * g))

def f_eyes_large(c):
    if not (c.y < HEAD_Y and abs(c.z - EYE_Z) > 0.003): return None
    d = de(c)
    if d > 0.022: return None
    return tangent_to_eye(c, Vector((0, 0, 0.0025 * sgn(c.z - EYE_Z) * gauss(d, 0.014))))

def f_eyes_almond(c):
    if not (c.y < HEAD_Y): return None
    d = de(c)
    if d > 0.026: return None
    ax = abs(c.x)
    outer = gauss(ax - (EYE_X + 0.014), 0.008) * gauss(c.z - EYE_Z, 0.012)
    inner = gauss(ax - (EYE_X - 0.014), 0.007) * gauss(c.z - EYE_Z, 0.012)
    dz = 0.003 * outer - 0.0015 * inner
    if c.z > EYE_Z + 0.003:
        dz -= 0.0015 * gauss(d, 0.012)
    return tangent_to_eye(c, Vector((0, 0, dz)))

def f_lids_heavy(c):
    if not (EYE_Z + 0.004 < c.z < EYE_Z + 0.022 and abs(abs(c.x) - EYE_X) < 0.02 and c.y < HEAD_YMIN + 0.05): return None
    k = bump(c.z, EYE_Z + 0.004, EYE_Z + 0.022)
    return tangent_to_eye(c, Vector((0, -0.003, -0.0025)) * k)

# The base mesh stares: settle the lids onto the eyeball before authoring morphs so the sclera no
# longer shows under the iris. This is baked into the basis; shells cut later inherit it.
for v in body.data.vertices:
    c = v.co
    if c.y < HEAD_Y and de(c) < 0.022 and abs(c.z - EYE_Z) > 0.0015:
        k = gauss(de(c), 0.014)
        dz = -0.0015 * k if c.z > EYE_Z else 0.0008 * k
        v.co = c + tangent_to_eye(c, Vector((0, 0, dz)))
body.data.update()

MORPHS = {
    'face_round': f_face_round, 'face_long': f_face_long,
    'jaw_wide': f_jaw_wide, 'jaw_narrow': f_jaw_narrow,
    'cheekbones_high': f_cheekbones_high, 'cheeks_full': f_cheeks_full, 'brow_heavy': f_brow_heavy,
    'nose_broad': f_nose_broad, 'nose_bridge': f_nose_bridge, 'nose_tip_down': f_nose_tip_down,
    'lips_full': f_lips_full,
    'eyes_large': f_eyes_large, 'eyes_almond': f_eyes_almond, 'lids_heavy': f_lids_heavy,
}
add_field_keys(body, MORPHS)
print('[face] shape keys:', [k.name for k in body.data.shape_keys.key_blocks])

# ------------------------------------------------------------------ beard region ---------
def is_beard(c):
    if not (CHIN_Z - 0.035 < c.z < EYE_Z - 0.048 and c.y < HEAD_Y): return False
    mouth = abs(c.x) < 0.03 and CHIN_Z + 0.02 < c.z < CHIN_Z + 0.05 and c.y < HEAD_YMIN + 0.05
    return not mouth

# ------------------------------------------------------------------ skin attributes ------
# Albedo multiplier per vertex (linear, mean ~0.8 so the runtime swatch still sets the complexion)
# plus a roughness value. Fine grain (pores, mottling) is added by texture nodes at bake time.
BASE = Vector((0.82, 0.80, 0.77))
def skin_features(c, n):
    m = Vector((1, 1, 1)); rough = 0.68
    face = c.z > CHIN_Z - 0.06 and c.y < HEAD_Y + 0.02
    if face and c.y < HEAD_Y:
        lip = math.exp(-((c.z - LIP_Z) / .010) ** 2 - (c.x / .033) ** 4) if c.y < HEAD_YMIN + 0.05 else 0
        m.x *= 1 - 0.14 * lip; m.y *= 1 - 0.36 * lip; m.z *= 1 - 0.40 * lip
        border = gauss(abs(c.z - LIP_Z) - 0.011, 0.0025) * max(0.0, 1 - (abs(c.x) / 0.033) ** 2) if c.y < HEAD_YMIN + 0.05 else 0
        m.x *= 1 - 0.05 * border; m.y *= 1 - 0.10 * border; m.z *= 1 - 0.10 * border
        cheek = math.exp(-((c.z - (EYE_Z - .038)) / .027) ** 2 - ((abs(c.x) - .050) / .023) ** 2)
        m.y *= 1 - 0.06 * cheek; m.z *= 1 - 0.09 * cheek
        tip = gauss((c - Vector((0, HEAD_YMIN, EYE_Z - 0.055))).length, 0.012)
        m.y *= 1 - 0.05 * tip; m.z *= 1 - 0.08 * tip
        d = de(c)
        socket = gauss(d - 0.016, 0.008) if c.z < EYE_Z + 0.004 else 0.0
        m.x *= 1 - 0.04 * socket; m.y *= 1 - 0.06 * socket; m.z *= 1 - 0.07 * socket
        near_eye_x = gauss(abs(c.x) - EYE_X, 0.015)
        if c.y < HEAD_YMIN + 0.05:
            crease = bump(c.z, EYE_Z + 0.008, EYE_Z + 0.019) * near_eye_x
            m.x *= 1 - 0.04 * crease; m.y *= 1 - 0.06 * crease; m.z *= 1 - 0.07 * crease
            under = gauss(c.z - (EYE_Z - 0.015), 0.006) * near_eye_x
            m.x *= 1 - 0.03 * under; m.y *= 1 - 0.05 * under; m.z *= 1 - 0.03 * under
            underbrow = bump(c.z, EYE_Z + 0.018, EYE_Z + 0.031) * (1.0 if 0.012 < abs(c.x) < 0.058 else 0.0)
            k = 1 - 0.05 * underbrow; m.x *= k; m.y *= k; m.z *= k
        # (a baked beard shadow read as dirt on darker complexions; beards are shells instead)
        tzone = (abs(c.x) < 0.018 and c.z > EYE_Z - 0.07) or (c.z > EYE_Z + 0.02 and abs(c.x) < 0.05) or (c.z < CHIN_Z + 0.02)
        rough = 0.50 if tzone else 0.58
        if lip > 0.5: rough = 0.42
    elif face:
        rough = 0.60
    # joints darker, palms and soles lighter
    for L in ('L', 'R'):
        for jn, rr in (('elbow', 0.045), ('knee', 0.055)):
            k = 1 - 0.10 * gauss((c - J[f'{jn}.{L}']).length, rr)
            m.x *= k; m.y *= k; m.z *= k
    if abs(c.x) > 0.19 and HANDTIP_Z + 0.015 < c.z < HANDTIP_Z + 0.05:
        k = 1 - 0.07 * bump(c.z, HANDTIP_Z + 0.015, HANDTIP_Z + 0.05)
        m.x *= k; m.y *= k; m.z *= k
        if n.x * sgn(c.x) < -0.5:  # palms face the body in the rest pose
            m.x *= 1.10; m.y *= 1.10; m.z *= 1.10; rough = 0.75
    if c.z < 0.012 and n.z < -0.5:
        m.x *= 1.10; m.y *= 1.10; m.z *= 1.10; rough = 0.75
    return Vector((BASE.x * m.x, BASE.y * m.y, BASE.z * m.z)), rough

bake_col = body.data.attributes.new(name='SkinBake', type='FLOAT_COLOR', domain='POINT')
bake_rough = body.data.attributes.new(name='SkinRough', type='FLOAT', domain='POINT')
for v in body.data.vertices:
    col, rough = skin_features(v.co, body_normal[v.index])
    bake_col.data[v.index].color = (col.x, col.y, col.z, 1.0)
    bake_rough.data[v.index].value = rough

# ------------------------------------------------------------------ skin bake ------------
def clear_nodes(m):
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'):
            nt.nodes.remove(n)
    return nt, nt.nodes['Principled BSDF']

def build_bake_material(m):
    nt, bsdf = clear_nodes(m)
    nodes, links = nt.nodes, nt.links
    attr = nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'SkinBake'
    uv = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 180; noise.inputs['Detail'].default_value = 3; noise.inputs['Roughness'].default_value = 0.6
    links.new(uv.outputs['UV'], noise.inputs['Vector'])
    mr = nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.3; mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Min'].default_value = 0.965; mr.inputs['To Max'].default_value = 1.035
    links.new(noise.outputs['Fac'], mr.inputs['Value'])
    vor = nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 900
    links.new(uv.outputs['UV'], vor.inputs['Vector'])
    mr2 = nodes.new('ShaderNodeMapRange')
    mr2.inputs['From Min'].default_value = 0.0; mr2.inputs['From Max'].default_value = 0.5
    mr2.inputs['To Min'].default_value = 0.975; mr2.inputs['To Max'].default_value = 1.0
    links.new(vor.outputs['Distance'], mr2.inputs['Value'])
    mix1 = nodes.new('ShaderNodeMix'); mix1.data_type = 'RGBA'; mix1.blend_type = 'MULTIPLY'; mix1.inputs[0].default_value = 1.0
    links.new(attr.outputs['Color'], mix1.inputs[6]); links.new(mr.outputs['Result'], mix1.inputs[7])
    mix2 = nodes.new('ShaderNodeMix'); mix2.data_type = 'RGBA'; mix2.blend_type = 'MULTIPLY'; mix2.inputs[0].default_value = 1.0
    links.new(mix1.outputs[2], mix2.inputs[6]); links.new(mr2.outputs['Result'], mix2.inputs[7])
    links.new(mix2.outputs[2], bsdf.inputs['Base Color'])
    rattr = nodes.new('ShaderNodeAttribute'); rattr.attribute_name = 'SkinRough'
    links.new(rattr.outputs['Fac'], bsdf.inputs['Roughness'])
    return nt

def bake_to(image, bake_type, pass_filter=None):
    nt = M['skin'].node_tree
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image
    nt.nodes.active = tex
    sel([body], body)
    bpy.ops.object.mode_set(mode='OBJECT')
    kwargs = dict(type=bake_type, target='IMAGE_TEXTURES', margin=6, use_clear=True)
    if pass_filter: kwargs['pass_filter'] = pass_filter
    bpy.ops.object.bake(**kwargs)
    nt.nodes.remove(tex)

def save_image(img, path):
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    img.pack()

skin_slots = list(body.data.materials)
assert body.data.uv_layers, 'body has no UVs to bake into'
# The bundle lays the body out over 9 x 2 UDIM tiles (mirrored again two tiles up). Fold the
# mirror, give the head tile the largest share of the unit square and pack the rest as cells.
HEAD_SHARE = 0.56
CELL = 0.22
cells = [(HEAD_SHARE + CELL * i, CELL * j) for j in range(4) for i in range(2)]
cells += [(CELL * i, HEAD_SHARE + CELL * j) for j in range(2) for i in range(2)]
TILE_ORDER = [(1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0), (7, 0), (8, 0), (0, 1), (1, 1), (2, 1)]
TILE_CELL = {t: c for t, c in zip(TILE_ORDER, cells)}
def repack_uv(u, v):
    tu, tv = math.floor(u), math.floor(v)
    if tv >= 2: tv -= 2
    fu, fv = u - math.floor(u), v - math.floor(v)
    if (tu, tv) == (0, 0):
        return (fu * HEAD_SHARE, fv * HEAD_SHARE)
    cu, cv = TILE_CELL.get((tu, tv), cells[-1])
    return (cu + 0.005 + fu * (CELL - 0.01), cv + 0.005 + fv * (CELL - 0.01))
uv_layer = body.data.uv_layers.active
for i, d in enumerate(uv_layer.data):
    d.uv = repack_uv(*d.uv)
print('[face] repacked body UVs into the unit square')
build_bake_material(M['skin'])
for i in range(len(body.data.materials)):
    body.data.materials[i] = M['skin']
prev_engine = scene.render.engine
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.render.bake.margin = 6
albedo = bpy.data.images.new(f'rider_skin_{GENDER}', 2048, 2048, alpha=False)
albedo.colorspace_settings.name = 'sRGB'
bake_to(albedo, 'DIFFUSE', {'COLOR'})
save_image(albedo, os.path.join(SCRATCH, f'skin_{GENDER}_albedo.png'))
rough_img = bpy.data.images.new(f'rider_skin_rough_{GENDER}', 512, 512, alpha=False)
rough_img.colorspace_settings.name = 'Non-Color'
bake_to(rough_img, 'ROUGHNESS')
save_image(rough_img, os.path.join(SCRATCH, f'skin_{GENDER}_rough.png'))
scene.render.engine = prev_engine
for i, m in enumerate(skin_slots):
    body.data.materials[i] = m
print('[face] baked skin textures')

def skin_material(m):
    nt, bsdf = clear_nodes(m)
    nodes, links = nt.nodes, nt.links
    tex = nodes.new('ShaderNodeTexImage'); tex.image = albedo
    mix = nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (*lin(hexc(SKIN_DEFAULT)), 1)
    links.new(tex.outputs['Color'], mix.inputs[6])
    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    rtex = nodes.new('ShaderNodeTexImage'); rtex.image = rough_img
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(rtex.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = 0
for name in ('skin', 'skin_feet', 'skin_hands', 'skin_arms'):
    skin_material(M[name])

# ------------------------------------------------------------------ mesh helpers ---------
def bm_object(name, bm, mat, uv_fn=None, group='head'):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    if uv_fn:
        layer = me.uv_layers.new(name='UVMap')
        for p in me.polygons:
            for li in p.loop_indices:
                layer.data[li].uv = uv_fn(me.vertices[me.loops[li].vertex_index].co)
    if group: rig_to(obj, group)
    return obj

def poly_object(name, vv, ff, mat, group='head', uv=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(vv, [], ff)
    me.update()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    if uv:
        layer = me.uv_layers.new(name='UVMap')
        for p in me.polygons:
            for li in p.loop_indices:
                layer.data[li].uv = uv[me.loops[li].vertex_index]
    if group: rig_to(obj, group)
    return obj

def apply_modifier(obj, md):
    sel([obj], obj)
    bpy.ops.object.modifier_apply(modifier=md.name)

FORWARD = Matrix.Rotation(math.pi / 2, 4, 'X')  # +Z pole -> -Y (forward)

# ------------------------------------------------------------------ eyes -----------------
M['sclera'] = material('sclera', (0.74, 0.70, 0.66), 0.35)
M['iris'] = material('iris', (0.17, 0.085, 0.04), 0.3)
M['cornea'] = material('cornea', (0.9, 0.9, 0.9), 0.05, 0.0, 0.06)
M['cornea'].node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.15
M['lash'] = material('lash', (0.04, 0.03, 0.03), 1.0)
M['kajal'] = material('kajal', (0.03, 0.03, 0.035), 0.9)

def eye_uv(ec):
    def fn(co):
        d = co - ec
        L = max(d.length, 1e-6)
        v = math.acos(max(-1.0, min(1.0, -d.y / L))) / math.pi  # 0 at the iris, 1 at the back
        u = math.atan2(d.x, d.z) / (2 * math.pi) + 0.5
        return (u, v)
    return fn

def iris_uv(ec, rad):
    return lambda co: (0.5 + (co.x - ec.x) / (2 * rad), 0.5 + (co.z - ec.z) / (2 * rad))

IRIS_R = 0.0056
OPEN_R = 0.0066  # corneal opening in the sclera
for side in ('L', 'R'):
    EYE_C[side] = EYE_C[side] + Vector((0, 0.0008, 0))
    ec = EYE_C[side]
    inward = math.radians(-2.5 if side == 'L' else 2.5)
    conv = Matrix.Translation(ec) @ Matrix.Rotation(inward, 4, 'Z') @ Matrix.Translation(-ec)
    # sclera with the front cap removed where the cornea sits
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=R)
    bmesh.ops.transform(bm, matrix=FORWARD, verts=bm.verts)
    open_y = -math.sqrt(max(R * R - OPEN_R * OPEN_R, 0))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < open_y + 0.0004], context='VERTS')
    bmesh.ops.transform(bm, matrix=conv @ Matrix.Translation(ec), verts=bm.verts)
    bm_object(f'Eye.{side}', bm, M['sclera'], eye_uv(ec))
    # iris disc, slightly dished, recessed 0.6 mm behind the opening
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=True, segments=48, radius=OPEN_R + 0.0004)
    iy = open_y + 0.0006
    bmesh.ops.transform(bm, matrix=Matrix.Translation(ec + Vector((0, iy, 0))) @ FORWARD, verts=bm.verts)
    for v in bm.verts:
        rr = math.hypot(v.co.x - ec.x, v.co.z - ec.z)
        v.co.y += 0.0009 * max(0.0, 1 - rr / IRIS_R)
    bmesh.ops.transform(bm, matrix=conv, verts=bm.verts)
    bm_object(f'Iris.{side}', bm, M['iris'], iris_uv(ec, OPEN_R + 0.0004))
    # cornea: front cap of a smaller sphere bulging 1 mm past the sclera
    bm = bmesh.new()
    RC = 0.0085
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=RC)
    bmesh.ops.transform(bm, matrix=FORWARD, verts=bm.verts)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.0052], context='VERTS')
    bmesh.ops.transform(bm, matrix=conv @ Matrix.Translation(ec + Vector((0, -(R - RC) - 0.001, 0))), verts=bm.verts)
    bm_object(f'Cornea.{side}', bm, M['cornea'])

# lashes along the upper lid margin, kajal along the lower lid (both eyes in one object each)
def lid_dir(theta, phi):
    return Vector((math.sin(theta) * math.cos(phi), -math.cos(theta) * math.cos(phi), math.sin(phi)))

lash_objs, kajal_objs = [], []
for side in ('L', 'R'):
    ec = EYE_C[side]
    s = 1 if side == 'L' else -1
    vv, ff = [], []
    n = 17
    for j in range(n):
        th = math.radians(-70 + 140 * j / (n - 1)) * s
        d = lid_dir(th, math.radians(31))
        root = ec + d * (R + 0.0009)
        outward = Vector((math.sin(th) * s, 0, 0)) * 0.25
        tip_dir = (Vector((0, -1, 0)) * 0.75 + Vector((0, 0, 1)) * 0.55 + outward).normalized()
        length = 0.0058 * (0.7 + 0.3 * math.cos(th * 0.8))
        vv.append(root); vv.append(root + tip_dir * length)
    for j in range(n - 1):
        k = j * 2
        ff.append((k, k + 1, k + 3, k + 2))
    lash = poly_object(f'lash_{side}', vv, ff, M['lash'])
    so = lash.modifiers.new('Solidify', 'SOLIDIFY'); so.thickness = 0.0005; so.offset = 0
    apply_modifier(lash, so)
    lash_objs.append(lash)
    # kajal: lower lid ribbon hugging the skin plus a thin line above the lash root
    rows = []
    for phi_deg, clearance in ((-21, 0.0035), (-26.5, 0.0035)):
        row = []
        for j in range(n):
            th = math.radians(-68 + 136 * j / (n - 1)) * s
            p = ec + lid_dir(th, math.radians(phi_deg)) * (R + clearance)
            row.append(skin_offset(p, 0.0006))
        rows.append(row)
    vv = rows[0] + rows[1]
    ff = [(j, j + 1, n + j + 1, n + j) for j in range(n - 1)]
    upper = []
    for j in range(n):
        th = math.radians(-70 + 140 * j / (n - 1)) * s
        upper.append(ec + lid_dir(th, math.radians(33.5)) * (R + 0.0012))
        upper.append(ec + lid_dir(th, math.radians(37)) * (R + 0.0014))
    base = len(vv)
    vv += upper
    ff += [(base + j * 2, base + j * 2 + 1, base + j * 2 + 3, base + j * 2 + 2) for j in range(n - 1)]
    kj = poly_object(f'kajal_{side}', vv, ff, M['kajal'])
    so = kj.modifiers.new('Solidify', 'SOLIDIFY'); so.thickness = 0.0006; so.offset = 0
    apply_modifier(kj, so)
    kajal_objs.append(kj)
lashes = join(lash_objs, 'lashes')
kajal = join(kajal_objs, 'accent_kajal')
for o in (lashes, kajal):
    bpy.ops.object.shade_smooth()
    add_field_keys(o, MORPHS)

# ------------------------------------------------------------------ brows ----------------
def is_brow(c):
    ax = abs(c.x)
    if not (0.012 < ax < 0.057 and c.y < HEAD_YMIN + 0.052): return False
    zc = EYE_Z + 0.019 + 0.0055 * smooth((ax - 0.014) / 0.028)
    half = 0.0048 - 0.0022 * smooth((ax - 0.032) / 0.022)
    if GENDER == 'female':
        half *= 0.62
    return abs(c.z - zc) < half
# built in rider_hair.py with the smoothed-rim shell; the predicate lives here with the face maths

# ------------------------------------------------------------------ beards ---------------
beard_stubble = shell('beard_stubble', is_beard, 0.004, M['beard'], 0.5)
beard_full = shell('beard_full', is_beard, 0.014, M['beard'], 0.5)
if beard_full:
    tex = bpy.data.textures.new('beard_grain', 'CLOUDS'); tex.noise_scale = 0.008
    dm = beard_full.modifiers.new('Displace', 'DISPLACE'); dm.texture = tex; dm.strength = 0.003; dm.mid_level = 0.5
    apply_modifier(beard_full, dm)
beard_moustache = shell('beard_moustache', lambda c: LIP_Z + 0.004 < c.z < LIP_Z + 0.017 and abs(c.x) < 0.031 and c.y < HEAD_YMIN + 0.04, 0.003, M['beard'], 0.5)
for o in (beard_stubble, beard_full, beard_moustache):
    add_field_keys(o, MORPHS)

# ------------------------------------------------------------------ accents --------------
M['bindi'] = material('bindi', lin(hexc('#b3121b')), 0.35)
M['gold'] = material('gold', lin(hexc('#d4a84a')), 0.28, 1.0)

forehead = min((v for v in verts if abs(v.x) < 0.004 and EYE_Z + 0.036 < v.z < EYE_Z + 0.046), key=lambda v: v.y)
bindi_c = Vector((0, forehead.y - 0.0006, forehead.z))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=0.0045)
bmesh.ops.transform(bm, matrix=Matrix.Translation(bindi_c) @ Matrix.Diagonal((1, 0.3, 1, 1)), verts=bm.verts)
bm_object('accent_bindi', bm, M['bindi'])

lobes = {}
for side, s in (('L', 1), ('R', -1)):
    cands = [v for v in verts if s * v.x > 0 and EYE_Z - 0.038 < v.z < EYE_Z - 0.026 and HEAD_Y - 0.015 < v.y < HEAD_Y + 0.04]
    lobe = max(cands, key=lambda v: abs(v.x))
    lobes[side] = Vector((lobe.x + s * 0.002, lobe.y, lobe.z))
studs = []
jhumkas = []
for side, s in (('L', 1), ('R', -1)):
    lc = lobes[side]
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.0028)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(lc), verts=bm.verts)
    studs.append(bm_object(f'stud_{side}', bm, M['gold']))
    # jhumka: stud + small ring + bell + bead
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.0026)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(lc), verts=bm.verts)
    jstud = bm_object(f'jhumka_stud_{side}', bm, M['gold'])
    ring_c = lc + Vector((0, 0, -0.006))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.0032, minor_radius=0.0006, major_segments=20, minor_segments=8,
                                     location=ring_c, rotation=(0, math.pi / 2, 0))
    ring = bpy.context.active_object
    ring.name = f'jhumka_ring_{side}'
    sel([ring], ring); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ring.data.materials.append(M['gold'])
    for p in ring.data.polygons: p.use_smooth = True
    rig_to(ring, 'head')
    bm_bell = bmesh.new()
    bmesh.ops.create_cone(bm_bell, cap_ends=True, cap_tris=True, segments=24, radius1=0.0022, radius2=0.0085, depth=0.012)
    bmesh.ops.transform(bm_bell, matrix=Matrix.Translation(lc + Vector((0, 0, -0.015))), verts=bm_bell.verts)
    bell = bm_object(f'jhumka_bell_{side}', bm_bell, M['gold'])
    bm_bead = bmesh.new()
    bmesh.ops.create_uvsphere(bm_bead, u_segments=12, v_segments=6, radius=0.0016)
    bmesh.ops.transform(bm_bead, matrix=Matrix.Translation(lc + Vector((0, 0, -0.0225))), verts=bm_bead.verts)
    bead = bm_object(f'jhumka_bead_{side}', bm_bead, M['gold'])
    jhumkas += [jstud, ring, bell, bead]
join(studs, 'accent_earring_studs')
join(jhumkas, 'accent_earring_jhumka')
print('[face] done: eyes, lashes, kajal, brows, beards, accents')
