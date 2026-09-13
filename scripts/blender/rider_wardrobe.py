"""Reference-built wardrobe, executed by build_rider.py with its rig and landmarks.

Metres, Blender Z up / -Y forward. Garments are wrapped around the actual body cross-sections
(max radius per angular sector + fabric ease, smoothed like tensioned cloth), so they follow the
anatomy of both bodies instead of being tubes. Nearest-body weights keep tailoring attached to
the existing standing/riding skeleton. Product colours are baked per garment; the runtime only
applies textile textures by material role (the part after the dot in a material name).
See docs/RIDER-REFERENCES.md for the product and colourway references.
"""
from mathutils.kdtree import KDTree

TAU = 2 * math.pi
tree = KDTree(len(body.data.vertices))
for v in body.data.vertices:
    tree.insert(v.co, v.index)
tree.balance()

def mat(name, color, rough, metal=0.0):
    if name not in M:
        M[name] = material(name, lin(hexc(color)), rough, metal)
    return M[name]

# Shared hardware / role materials. "<garment>.<role>" names are recoloured or textured at runtime
# by role only, so every product keeps its own catalogue colours.
for name, color, rough, metal in [
    ('hw.zipper', '#5b5e60', .35, .6), ('hw.rubber', '#141617', .9, 0), ('hw.reflective', '#c9ccc9', .45, .1),
    ('hw.pull_red', '#b8292f', .6, 0), ('hw.velcro', '#202324', .95, 0), ('hw.plastic_black', '#1a1c1e', .45, 0),
    ('hw.mesh_black', '#1b1d1f', .96, 0), ('hw.lining', '#26282b', .95, 0),
    ('hw.badge', '#0e0f10', .5, 0), ('hw.badge_text', '#d8d4c8', .5, .2), ('hw.stitch', '#6e6252', .9, 0),
    ('hw.knox_grey', '#7d8184', .55, 0), ('hw.knox_black', '#1c1e20', .5, 0), ('hw.strap_black', '#1e2022', .92, 0),
    ('hw.sole', '#1a1b1c', .85, 0), ('hw.sole_tan', '#6b5138', .8, 0), ('hw.lace_black', '#161718', .9, 0),
    ('hw.lace_tan', '#4a3a2a', .9, 0), ('hw.buckle', '#8c8f92', .35, .7),
]:
    mat(name, color, rough, metal)

def weighted(obj):
    groups = {g.index: obj.vertex_groups.new(name=g.name) for g in body.vertex_groups}
    for v in obj.data.vertices:
        weights = {}
        near = tree.find_n(v.co, 3)
        total = sum(1 / max(d, .002) ** 2 for _, _, d in near)
        for _, idx, d in near:
            share = 1 / max(d, .002) ** 2 / total
            for g in body.data.vertices[idx].groups:
                weights[g.group] = weights.get(g.group, 0) + share * g.weight
        for idx, value in weights.items():
            if value > .001:
                groups[idx].add([v.index], value, 'REPLACE')
    md = obj.modifiers.new('Armature', 'ARMATURE')
    md.object = rig
    obj.parent = rig

def recalc(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data); bm.free()

def mesh_part(name, vertices, faces, mats, indices=None, bone_name=None, uv=None, smooth_shade=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(vertices, [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    for m in mats: me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = smooth_shade
        if indices: p.material_index = indices[p.index]
    layer = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            i = me.loops[li].vertex_index
            co = me.vertices[i].co
            layer.data[li].uv = uv[i] if uv else (co.x * 2 + co.y, co.z * 2)
    recalc(obj)
    if bone_name: rig_to(obj, bone_name)
    else: weighted(obj)
    return obj

def subdivide(obj, levels=1):
    sub = obj.modifiers.new('Soft tailoring', 'SUBSURF')
    sub.levels = levels
    sel([obj], obj)
    bpy.ops.object.modifier_move_to_index(modifier=sub.name, index=0)
    bpy.ops.object.modifier_apply(modifier=sub.name)

def table(x, pts):
    """Catmull-Rom through (x, y) control points, clamped at the ends."""
    if x <= pts[0][0]: return pts[0][1]
    if x >= pts[-1][0]: return pts[-1][1]
    for i in range(len(pts) - 1):
        if pts[i][0] <= x <= pts[i + 1][0]:
            p0 = pts[max(i - 1, 0)][1]; p1 = pts[i][1]; p2 = pts[i + 1][1]; p3 = pts[min(i + 2, len(pts) - 1)][1]
            t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0])
            return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
    return pts[-1][1]

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def frame(d):
    """Front and side unit vectors perpendicular to axis d (front = -Y projected)."""
    d = d.normalized()
    f = Vector((0, -1, 0)); f = (f - d * f.dot(d))
    if f.length < 1e-4: f = Vector((0, 0, -1)) - d * Vector((0, 0, -1)).dot(d)
    f.normalize()
    return d, f, d.cross(f)

def sector_radii(c, d, f, s, vs, h, count):
    r = [0.0] * count
    for v in vs:
        rel = v - c
        t = rel.dot(d)
        if abs(t) > h: continue
        p = rel - d * t
        a = math.atan2(p.dot(s), p.dot(f)) % TAU
        k = int(a / TAU * count) % count
        L = p.length
        if L > r[k]: r[k] = L
    filled = [i for i in range(count) if r[i] > 0]
    if not filled: return None
    if len(filled) < count:
        for i in range(count):
            if r[i] > 0: continue
            lo = max(j for j in filled if j < i) if any(j < i for j in filled) else max(filled) - count
            hi = min(j for j in filled if j > i) if any(j > i for j in filled) else min(filled) + count
            t = (i - lo) / (hi - lo)
            r[i] = r[lo % count] * (1 - t) + r[hi % count] * t
    return r

def wrap(name, rings, mats, panel=lambda j, z, a: 0, count=48, ease=.02, smooth=2, axial=True,
         bone_name=None, sub=1, shape=None, uv_scale=1.0, dilate=0):
    """rings: list of (centre, direction, slab half-height, vertex source, ease multiplier)."""
    data = []
    for c, d, h, vs, em in rings:
        d, f, s = frame(d)
        r = sector_radii(c, d, f, s, vs, h, count)
        if r is None: r = [.04] * count
        if dilate:
            r = [max(r[(k + o) % count] for o in range(-dilate, dilate + 1)) for k in range(count)]
        raw = list(r)
        for _ in range(smooth):
            r = [(r[k - 1] + 2 * r[k] + r[(k + 1) % count]) / 4 for k in range(count)]
        r = [max(a, b) for a, b in zip(r, raw)]
        data.append([c, d, f, s, r, em, raw])
    if axial and len(data) > 2:
        rs = [row[4] for row in data]
        for j in range(1, len(data) - 1):
            data[j][4] = [max((rs[j - 1][k] + 2 * rs[j][k] + rs[j + 1][k]) / 4, data[j][6][k]) for k in range(count)]
    vv, ff, ids, uv = [], [], [], []
    for j, (c, d, f, s, r, em, raw) in enumerate(data):
        for k in range(count + 1):
            a = TAU * k / count
            rr = r[k % count] + ease * em
            if shape: rr = shape(j, a, rr)
            vv.append(c + (f * math.cos(a) + s * math.sin(a)) * rr)
            uv.append((k / count * uv_scale, j / max(len(data) - 1, 1) * uv_scale))
    for j in range(len(data) - 1):
        for k in range(count):
            i = j * (count + 1) + k
            ff.append((i, i + 1, i + count + 2, i + count + 1))
            ids.append(panel(j, data[j][0].z, TAU * (k + .5) / count))
    obj = mesh_part(name, vv, ff, mats, ids, bone_name, uv)
    if sub: subdivide(obj, sub)
    return obj

def strip(name, points, radius, mat, bone_name=None, res=2):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = res
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points): p.co = (*co, 1)
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    sel([ob], ob)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.object
    ob.data.materials.append(mat)
    for p in ob.data.polygons: p.use_smooth = True
    if bone_name: rig_to(ob, bone_name)
    else: weighted(ob)
    return ob

def box(name, c, dims, mat, bone_name=None, bevel=.003, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c)
    o = bpy.context.object
    o.name = name
    o.scale = dims
    if rot: o.rotation_euler = rot
    sel([o], o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    be = o.modifiers.new('Tailored edges', 'BEVEL')
    be.width = min(bevel, min(dims) * .45); be.segments = 3
    bpy.ops.object.modifier_apply(modifier=be.name)
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    if bone_name: rig_to(o, bone_name)
    else: weighted(o)
    return o

def label(name, text, center, size, mat, bone_name, rot=None, project=None):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = text; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.size = size; cu.extrude = .0004
    ob = bpy.data.objects.new(name, cu); scene.collection.objects.link(ob)
    ob.location = center; ob.rotation_euler = rot or (math.pi / 2, 0, 0)
    sel([ob], ob); bpy.ops.object.convert(target='MESH')
    ob = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if project:
        for v in ob.data.vertices: v.co = project(v.co)
    ob.data.materials.append(mat); rig_to(ob, bone_name)
    return ob

body_pts = [Vector(v) for v in verts]

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length

def is_arm_vert(v):
    if v.z > SHOULDER_Z - .015: return False
    L = 'L' if v.x > 0 else 'R'
    return (seg_dist(v, J[f'shoulder.{L}'], J[f'elbow.{L}']) < .075 or seg_dist(v, J[f'elbow.{L}'], J[f'wrist.{L}']) < .062
            or seg_dist(v, J[f'wrist.{L}'], J[f'handtip.{L}']) < .07)
ARM_PTS = [v for v in body_pts if is_arm_vert(v)]
TRUNK_PTS = [v for v in body_pts if not is_arm_vert(v)]
in_box = lambda lo, hi: [v for v in body_pts if lo[0] <= v.x <= hi[0] and lo[1] <= v.y <= hi[1] and lo[2] <= v.z <= hi[2]]

# ======================================================================= jackets ===========
# Torso rings from the hem to the collar base; arm verts are excluded by |x| above the chest.
Z = Vector((0, 0, 1))
torso_src = [v for v in TRUNK_PTS if HIP_Z - .05 < v.z < NECK_Z + .03 and abs(v.x) < .215]
HEM_Z = HIP_Z - .012
torso_z = [HEM_Z, HEM_Z + .03, HEM_Z + .07, HEM_Z + .115, HEM_Z + .165, HEM_Z + .22, HEM_Z + .275,
           HEM_Z + .33, HEM_Z + .385, HEM_Z + .43, HEM_Z + .465, SHOULDER_Z - .018, SHOULDER_Z + .004,
           SHOULDER_Z + .022, NECK_Z - .002, NECK_Z + .012]
def torso_rings():
    rings = []
    for z in torso_z:
        c = centroid(pts(z, .02, lambda v: abs(v.x) < .19)) or Vector((0, 0, z))
        c = Vector((0, c.y, z))
        near_shoulder = smoothstep(SHOULDER_Z - .07, SHOULDER_Z - .005, z)
        # Shoulder armour under the yoke; snug at the collar.
        em = 1.0 + .45 * near_shoulder - .6 * smoothstep(SHOULDER_Z + .005, NECK_Z + .012, z)
        h = .012 if z < SHOULDER_Z - .03 else .006
        rings.append((c, Z, h, torso_src, em))
    return rings

def arm_axis(L):
    return [J[f'shoulder.{L}'] + Vector((0, 0, .012)), J[f'elbow.{L}'], J[f'wrist.{L}']]
def along(poly, t):
    """Point and direction at parameter t in [0, 1] along a polyline (t=.5 at the middle joint)."""
    if t <= .5:
        a, b = poly[0], poly[1]; u = t * 2
    else:
        a, b = poly[1], poly[2]; u = (t - .5) * 2
    return a.lerp(b, u), (b - a)
SLEEVE_T = [.05, .1, .16, .24, .34, .44, .5, .56, .66, .76, .86, .93, 1.0]
def sleeve_rings(L, side):
    poly = arm_axis(L)
    src = [v for v in body_pts if side * v.x > .1 and HANDTIP_Z - .02 < v.z < SHOULDER_Z + .03
           and (is_arm_vert(v) or v.z > SHOULDER_Z - .05)]
    rings = []
    for t in SLEEVE_T:
        c, d = along(poly, t)
        if t < .5: d = (poly[1] - poly[0]).lerp(poly[2] - poly[1], smoothstep(.3, .5, t))
        else: d = (poly[2] - poly[1]).lerp(poly[1] - poly[0], smoothstep(.7, .5, t))
        em = 1.1 - .4 * smoothstep(.5, 1.0, t)
        dn = d.normalized()
        rmax = .072 if t < .5 else .06
        ring_src = [v for v in src if abs((v - c).dot(dn)) < .025 and ((v - c) - dn * (v - c).dot(dn)).length < rmax]
        rings.append((c, d, .02, ring_src, em))
    return rings

SLEEVE_CUFF_R = {}
def build_jacket(key, body_mats, torso_panel, sleeve_panel, pull, badge, back_logo_reflective, has_chest_pocket=False,
                 collar_mat=None, hem_mat=None):
    pieces = []
    torso = wrap(f'{key}_torso', torso_rings(), body_mats, torso_panel, count=56, ease=.02)
    pieces.append(torso)
    collar_mat = collar_mat or body_mats[0]
    hem_mat = hem_mat or body_mats[0]
    # Stand collar: two rings around the neck with a small flare.
    nc = centroid(pts(NECK_Z + .015, .012)) or Vector((0, 0, NECK_Z + .015))
    neck_src = [v for v in body_pts if NECK_Z - .01 < v.z < NECK_Z + .05 and abs(v.x) < .09]
    collar = wrap(f'{key}_collar', [
        (Vector((0, nc.y, NECK_Z + .005)), Z, .012, neck_src, .95),
        (Vector((0, nc.y, NECK_Z + .03)), Z, .012, neck_src, 1.05),
        (Vector((0, nc.y - .004, NECK_Z + .052)), Z, .012, neck_src, 1.25),
    ], [collar_mat], count=40, ease=.014, sub=1)
    pieces.append(collar)
    pieces.append(strip(f'{key}_collar_edge', [Vector((0, nc.y - .004, NECK_Z + .052)) + Vector((math.sin(a) * .066, -math.cos(a) * .07, 0)) for a in [TAU * k / 40 for k in range(41)]], .003, M['hw.rubber'], 'neck'))
    # Hem band, slightly cinched.
    hc = centroid(pts(HEM_Z, .02, lambda v: abs(v.x) < .19))
    hem_src = [v for v in torso_src if HEM_Z - .03 < v.z < HEM_Z + .03]
    pieces.append(wrap(f'{key}_hem', [
        (Vector((0, hc.y, HEM_Z - .016)), Z, .02, hem_src, 1.0),
        (Vector((0, hc.y, HEM_Z + .012)), Z, .02, hem_src, 1.15),
    ], [hem_mat], count=56, ease=.018, sub=1))
    # Front zip from the hem to the collar, offset to the garment surface.
    front_y = lambda z: (centroid(pts(z, .02, lambda v: abs(v.x) < .04 and v.y < 0)) or Vector((0, -.1, z))).y
    zip_pts = [(0, min(front_y(z) - .03, -.09), z) for z in [HEM_Z + .01 + i * (NECK_Z + .04 - HEM_Z) / 14 for i in range(15)]]
    pieces.append(strip(f'{key}_zip_tape', zip_pts, .0045, M['hw.plastic_black']))
    pieces.append(strip(f'{key}_zip_teeth', [(x, y - .0035, z) for x, y, z in zip_pts], .0015, M['hw.zipper']))
    zp = zip_pts[9]
    pieces.append(box(f'{key}_zip_pull', (0, zp[1] - .006, zp[2] - .03), (.009, .004, .026), pull, 'chest'))
    # Hand pockets: vertical zips with pulls, both sides.
    for side in (-1, 1):
        z0, z1 = HEM_Z + .10, HEM_Z + .215
        y0 = front_y(z0) - .026; y1 = front_y(z1) - .028
        pieces.append(strip(f'{key}_pocket_zip', [(side * .10, y0, z0), (side * .118, y1, z1)], .0035, M['hw.plastic_black']))
        pieces.append(strip(f'{key}_pocket_teeth', [(side * .10, y0 - .0028, z0), (side * .118, y1 - .0028, z1)], .0012, M['hw.zipper']))
        pieces.append(box(f'{key}_pocket_pull', (side * .10, y0 - .006, z0 + .008), (.007, .004, .02), pull, 'spine'))
    if has_chest_pocket:
        z0 = HEM_Z + .36
        pieces.append(strip(f'{key}_chest_zip', [(-.045, front_y(z0) - .03, z0), (-.115, front_y(z0) - .026, z0 + .012)], .0032, M['hw.plastic_black']))
    # Chest badge (left) and shoulder badge (right), small and dark like the products.
    bz = HEM_Z + .40
    by = front_y(bz) - .036
    pieces.append(box(f'{key}_chest_badge', (-.085, by, bz), (.03, .003, .014), badge, 'chest', .002))
    pieces.append(label(f'{key}_chest_text', 'ROYAL ENFIELD', (-.085, by - .002, bz), .0042, M['hw.badge_text'], 'chest'))
    # Back: reflective wordmark across the shoulder blades.
    bk = centroid(pts(HEM_Z + .40, .02, lambda v: abs(v.x) < .06 and v.y > 0))
    pieces.append(label(f'{key}_back_text', 'ROYAL ENFIELD', (0, bk.y + .034, HEM_Z + .40), .012,
                        M['hw.reflective'] if back_logo_reflective else M['hw.badge'], 'chest', (math.pi / 2, 0, math.pi)))
    for side, L in ((1, 'L'), (-1, 'R')):
        sleeve = wrap(f'{key}_sleeve_{L}', sleeve_rings(L, side), body_mats, sleeve_panel, count=36, ease=.014)
        pieces.append(sleeve)
        poly = arm_axis(L)
        # Forearm and bicep velcro adjusters on the outer arm, cuff with a tab.
        for t, w in ((.30, .05), (.80, .042)):
            c, d = along(poly, t)
            out = Vector((side, 0, 0))
            r = .052 if t < .5 else .042
            pieces.append(box(f'{key}_adjuster', c + out * (r + .012) + Vector((0, .01, 0)), (.008, .03, w), M['hw.velcro'], None, .002))
        wr = poly[2]
        d_hand = (wr - poly[1]).normalized()
        cuff_src = [v for v in body_pts if side * v.x > .2 and WRIST_Z - .04 < v.z < WRIST_Z + .08]
        pieces.append(wrap(f'{key}_cuff_{L}', [
            (wr + d_hand * -.03, d_hand, .015, cuff_src, 1.0),
            (wr + d_hand * .005, d_hand, .015, cuff_src, 1.05),
        ], [M['hw.mesh_black'] if key == 'sw' else body_mats[2]], count=32, ease=.012))
    return join(pieces, f'gear_jacket_{key}')

# --- Windfarer V2, green: olive mesh body, black Cordura shoulders / elbows, black chest and
#     hem bands, red pulls, reflective piping, velcro badge patch on the left shoulder.
mat('wf.mesh', '#48563a', .96); mat('wf.cordura', '#1f2224', .88); mat('wf.textile', '#3f4b33', .9)
WF = [M['wf.textile'], M['wf.mesh'], M['wf.cordura']]
def wf_torso(j, z, a):
    front = math.cos(a) > 0
    if z > SHOULDER_Z - .045: return 2  # yoke and shoulders in Cordura
    if z > HEM_Z + .385 and front and abs(math.sin(a)) > .3: return 2  # upper chest panels
    if z < HEM_Z + .045: return 0
    if front and abs(math.sin(a)) < .12: return 0  # zip placket
    return 1
def wf_sleeve(j, z, a):
    t = SLEEVE_T[min(j, len(SLEEVE_T) - 1)]
    if t < .16: return 2  # shoulder cap
    if .34 < t < .62 and math.cos(a) < .3: return 2  # elbow patch, back/outside
    if t > .88: return 0
    return 1
jackets = {}
jackets['wf'] = build_jacket('wf', WF, wf_torso, wf_sleeve, M['hw.pull_red'], M['hw.badge'], True,
                             collar_mat=M['wf.cordura'], hem_mat=M['wf.cordura'])

# --- Streetwind V2, black: near-total black mesh, 600D at the shoulders and elbows, subtle
#     grey reflective piping over the shoulders, black YKK zips, two front pockets.
mat('sw.mesh', '#1f2224', .97); mat('sw.textile', '#2a2d31', .86); mat('sw.trim', '#33373b', .8)
SW = [M['sw.textile'], M['sw.mesh'], M['sw.trim']]
def sw_torso(j, z, a):
    front = math.cos(a) > 0
    if z > SHOULDER_Z - .03: return 0
    if z < HEM_Z + .04: return 0
    if front and abs(math.sin(a)) < .1: return 0
    return 1
def sw_sleeve(j, z, a):
    t = SLEEVE_T[min(j, len(SLEEVE_T) - 1)]
    if t < .12: return 0
    if .36 < t < .6 and math.cos(a) < .2: return 2
    if t > .9: return 0
    return 1
jackets['sw'] = build_jacket('sw', SW, sw_torso, sw_sleeve, M['hw.plastic_black'], M['hw.badge'], True)

# --- Explorer V3, grey: 600D grey shell, mesh chest / inner arm / back panels, darker grey
#     impact zones, reflective logos, five pockets including a chest pocket.
mat('ex.textile', '#6f7478', .88); mat('ex.mesh', '#55595d', .96); mat('ex.cordura', '#3d4145', .82)
EX = [M['ex.textile'], M['ex.mesh'], M['ex.cordura']]
def ex_torso(j, z, a):
    front = math.cos(a) > 0
    if z > SHOULDER_Z - .04: return 2
    if HEM_Z + .2 < z < HEM_Z + .36 and front and .2 < abs(math.sin(a)) < .75: return 1  # chest vents
    if HEM_Z + .15 < z < HEM_Z + .4 and math.cos(a) < -.4 and abs(math.sin(a)) < .55: return 1  # back vent
    return 0
def ex_sleeve(j, z, a):
    t = SLEEVE_T[min(j, len(SLEEVE_T) - 1)]
    if t < .14: return 2
    if .34 < t < .62 and math.cos(a) < .2: return 2
    if .16 < t < .86 and math.cos(a) > .55: return 1  # inner arm mesh
    return 0
jackets['ex'] = build_jacket('ex', EX, ex_torso, ex_sleeve, M['hw.plastic_black'], M['hw.reflective'], True,
                             has_chest_pocket=True, collar_mat=M['ex.cordura'])

# Reflective piping on the Streetwind and Windfarer over the shoulder seams.
for key in ('wf', 'sw'):
    pieces = [jackets[key]]
    for side in (-1, 1):
        sh = J['shoulder.L' if side > 0 else 'shoulder.R']
        pieces.append(strip(f'{key}_piping', [
            (side * .06, sh.y - .07, SHOULDER_Z + .03), (side * .13, sh.y - .055, SHOULDER_Z + .035), (side * .19, sh.y - .03, SHOULDER_Z + .02),
        ], .0015, M['hw.reflective'], 'chest'))
    jackets[key] = join(pieces, f'gear_jacket_{key}')

# ======================================================================= gloves ============
# Leather shells over the hands with a hard knuckle, wrist strap, and the products' colour split.
GLOVES = {
    'intrepid': dict(back='#4c5148', palm='#1d1f21', cuff=.028, knuckle='#2a2d30', knuckle_hard=False),
    'stalwart': dict(back='#1a1c1e', palm='#4d5540', cuff=.03, knuckle='#22252a', knuckle_hard=True),
    'cragsman': dict(back='#1c1d1f', palm='#5a3d2b', cuff=.07, knuckle='#1d1f21', knuckle_hard=True),
}
for gid, g in GLOVES.items():
    mat(f'{gid}.leather', g['back'], .62); mat(f'{gid}.leather_palm', g['palm'], .7); mat(f'{gid}.knuckle', g['knuckle'], .4)
    glove = shell(f'{gid}_skin', lambda c, cuff=g['cuff']: is_arm(c) and c.z < WRIST_Z + cuff, .0045, M[f'{gid}.leather'])
    # palm side (towards the body / front) uses the palm material
    glove.data.materials.append(M[f'{gid}.leather_palm'])
    for p in glove.data.polygons:
        n = p.normal
        c = sum((glove.data.vertices[i].co for i in p.vertices), Vector()) / len(p.vertices)
        if c.z < WRIST_Z + .01 and abs(n.x) > .5 and n.x * (1 if c.x > 0 else -1) < 0:
            p.material_index = 1
    pieces = [glove]
    for side, L in ((1, 'L'), (-1, 'R')):
        wr, tip = J[f'wrist.{L}'], J[f'handtip.{L}']
        hand_src = [v for v in body_pts if side * v.x > .25 and WRIST_Z - .09 < v.z < WRIST_Z + .01]
        kn = wr.lerp(tip, .5)
        out = Vector((side, 0, 0))
        edge = max((v - kn).dot(out) for v in hand_src if abs(v.z - kn.z) < .02)
        if g['knuckle_hard']:
            pieces.append(prim_sphere(f'{gid}_knuckle', kn + out * (edge - .004) + Vector((0, 0, .004)), .03, M[f'{gid}.knuckle'], f'hand.{L}', (.35, .75, 1.0)))
        else:
            pieces.append(prim_sphere(f'{gid}_knuckle', kn + out * (edge - .006), .026, M[f'{gid}.leather'], f'hand.{L}', (.3, .7, .9)))
        # wrist strap + TPR tab
        wrist_src = [v for v in body_pts if side * v.x > .25 and abs(v.z - (wr.z + .006)) < .02]
        pieces.append(wrap(f'{gid}_strap', [
            (Vector((wr.x, wr.y, wr.z - .004)), Z, .012, wrist_src, 1.0),
            (Vector((wr.x, wr.y, wr.z + .018)), Z, .012, wrist_src, 1.0),
        ], [M['hw.strap_black']], count=28, ease=.009, bone_name=f'hand.{L}', sub=0))
        pieces.append(box(f'{gid}_tab', wr + out * (edge - .0) + Vector((0, -.01, .008)), (.006, .02, .014), M['hw.plastic_black'], f'hand.{L}', .0015))
        if g['cuff'] > .05:
            cuff_src = [v for v in body_pts if side * v.x > .22 and wr.z + .02 < v.z < wr.z + .09]
            pieces.append(wrap(f'{gid}_gauntlet', [
                (Vector((wr.x, wr.y, wr.z + .02)), Z, .015, cuff_src, 1.0),
                (Vector((wr.x - side * .004, wr.y, wr.z + .068)), Z, .015, cuff_src, 1.4),
            ], [M[f'{gid}.leather']], count=28, ease=.01, bone_name=f'hand.{L}', sub=1))
    join(pieces, f'gear_gloves_{gid}')

# ======================================================================= knee guards =======
# Knox LDPE plates with a honeycomb of perforations, foam backing and elasticated straps.
mat('knee.plate', '#1e2023', .48); mat('knee.plate_grey', '#767a7d', .5)
def hex_plate(name, L, side, z_lo, z_hi, plate_mat, cup_out, bulge_z, split=False):
    k = J[f'knee.{L}']
    leg_src = [v for v in body_pts if side * v.x > .03 and z_lo - .05 < v.z < z_hi + .05 and abs(v.x - k.x) < .12]
    n = 9
    rings = []
    for i in range(n):
        z = z_lo + (z_hi - z_lo) * i / (n - 1)
        c = centroid(pts(z, .015, lambda v: side * v.x > .03 and abs(v.x - k.x) < .12)) or Vector((k.x, k.y, z))
        rings.append((Vector((c.x, c.y, z)), Z, .014, leg_src, 1.0))
    def shape(j, a, r):
        z = z_lo + (z_hi - z_lo) * j / (n - 1)
        front = max(0.0, math.cos(a))
        bulge = cup_out * front ** 2.2 * math.exp(-((z - bulge_z) / .055) ** 2)
        # the plate wraps the front 200 degrees; the rest is backing at body distance
        return r + bulge + .004
    def panel(j, z, a):
        return 0 if abs(a if a < math.pi else a - TAU) < 1.75 else 1
    plate = wrap(name, rings, [plate_mat, M['hw.lining']], panel, count=40, ease=.006, shape=shape, bone_name=f'shin.{L}', sub=1)
    # perforation holes as dark dots in a hex grid on the front of the plate
    pieces = [plate]
    for i in range(6):
        for jj in range(3):
            z = bulge_z - .045 + i * .018
            a = (jj - 1) * .42 + (.21 if i % 2 else 0)
            c = centroid(pts(z, .015, lambda v: side * v.x > .03 and abs(v.x - k.x) < .12)) or Vector((k.x, k.y, z))
            r = max((v - Vector((c.x, c.y, v.z))).length for v in leg_src if abs(v.z - z) < .015) + .006 + cup_out * max(0.0, math.cos(a)) ** 2.2 * math.exp(-((z - bulge_z) / .055) ** 2) + .002
            p = Vector((c.x, c.y, z)) + Vector((math.sin(a) * r, -math.cos(a) * r, 0))
            pieces.append(prim_sphere('perf', p - Vector((math.sin(a), -math.cos(a), 0)) * .0022, .003, M['hw.rubber'], f'shin.{L}', (1, .6, 1)))
    return pieces

for kind in ('soft', 'shell'):
    pieces = []
    for side, L in ((1, 'L'), (-1, 'R')):
        k = J[f'knee.{L}']; bn = f'shin.{L}'
        if kind == 'soft':
            pieces += hex_plate(f'challenger_{L}', L, side, k.z - .075, k.z + .075, M['knee.plate_grey'], .02, k.z + .005)
            straps = (k.z - .095, k.z + .085)
        else:
            pieces += hex_plate(f'conqueror_{L}', L, side, k.z - .19, k.z + .08, M['knee.plate'], .024, k.z + .005)
            straps = (k.z - .205, k.z - .07, k.z + .09)
        leg_src = [v for v in body_pts if side * v.x > .03 and k.z - .25 < v.z < k.z + .13 and abs(v.x - k.x) < .12]
        for sz in straps:
            c = centroid(pts(sz, .015, lambda v: side * v.x > .03 and abs(v.x - k.x) < .12)) or Vector((k.x, k.y, sz))
            pieces.append(wrap('guard_strap', [
                (Vector((c.x, c.y, sz - .012)), Z, .012, leg_src, 1.0), (Vector((c.x, c.y, sz + .012)), Z, .012, leg_src, 1.0),
            ], [M['hw.strap_black']], count=32, ease=.007, bone_name=bn, sub=0))
        pieces.append(label('knox_mark', 'KNOX', (k.x, k.y - .09 - (.024 if kind == 'shell' else .02), k.z - (.09 if kind == 'shell' else .05)), .0085, M['hw.reflective'], bn))
    join(pieces, 'gear_knee_' + kind)

# ======================================================================= elbow guards ======
pieces = []
for side, L in ((1, 'L'), (-1, 'R')):
    c = J[f'elbow.{L}']
    arm_src = [v for v in body_pts if side * v.x > .16 and abs(v.z - c.z) < .12]
    d = (J[f'wrist.{L}'] - J[f'shoulder.{L}']).normalized()
    rings = [(c + d * t, d, .014, arm_src, 1.0) for t in (-.075, -.04, 0, .04, .075)]
    def eshape(j, a, r, c=c):
        back = max(0.0, -math.cos(a))
        return r + .02 * back ** 2 * math.exp(-((j - 2) / 1.3) ** 2) + .003
    pieces.append(wrap(f'elbow_{L}', rings, [M['knee.plate'], M['hw.lining']], lambda j, z, a: 0 if math.cos(a) < .3 else 1, count=32, ease=.006, shape=eshape, bone_name=f'forearm.{L}', sub=1))
    for t in (-.085, .085):
        p = c + d * t
        pieces.append(wrap('elbow_strap', [(p - d * .01, d, .012, arm_src, 1.0), (p + d * .01, d, .012, arm_src, 1.0)], [M['hw.strap_black']], count=28, ease=.006, bone_name=f'forearm.{L}', sub=0))
join(pieces, 'gear_elbow')

# ======================================================================= boots =============
# Foot-shaped lasts wrapped around the actual foot, with a moulded sole, tongue, laces or
# buckles, toe / heel counters and a shift pad on the left boot.
BOOTS = {
    'cabo': dict(height=.15, leather='#23262a', sole=M['hw.sole'], lace=M['hw.lace_black'], laces=True, counter='#1a1c1f'),
    'marshall': dict(height=.19, leather='#8a5a35', sole=M['hw.sole_tan'], lace=M['hw.lace_tan'], laces=True, counter='#6b4426'),
    'touring': dict(height=.37, leather='#1e2124', sole=M['hw.sole'], lace=None, laces=False, counter='#2c3034'),
}
for bid, b in BOOTS.items():
    mat(f'{bid}.leather', b['leather'], .55); mat(f'{bid}.counter', b['counter'], .5)
    pieces = []
    for side, L in ((1, 'L'), (-1, 'R')):
        ankle, toe = J[f'ankle.{L}'], J[f'toe.{L}']
        bn = f'foot.{L}'
        foot_src = [v for v in body_pts if side * v.x > .02 and v.z < b['height'] + .06]
        forward = Vector((toe.x - ankle.x, toe.y - ankle.y, 0)).normalized()
        zs = [.026, .04, .058, .08, .105] + ([.13, .15] if b['height'] <= .16 else [.13, .16, .19] if b['height'] <= .2 else [.14, .18, .23, .28, .33, .37])
        rings = []
        for z in zs:
            fz = min(z, .11)
            c = centroid(pts(fz, .012, lambda v: side * v.x > .02 and (v.z > .02 or True))) or Vector((ankle.x, ankle.y, z))
            c = Vector((c.x, c.y, z))
            src = [v for v in foot_src if abs(v.z - fz) < .03]
            em = 1.0 if z > .1 else 1.3  # more room around toes and the heel
            rings.append((c, Z, .02, src, em))
        def bshape(j, a, r, zs=zs, fwd=forward):
            z = zs[j]
            # toe cap fullness at the front of the low rings
            dir_front = Vector((math.sin(a), -math.cos(a), 0))
            f = max(0.0, dir_front.dot(fwd))
            return r + (.008 * f ** 2 if z < .06 else 0) + (.004 if z > .12 else 0)
        def bpanel(j, z, a, zs=zs, fwd=forward):
            dir_front = Vector((math.sin(a), -math.cos(a), 0))
            f = dir_front.dot(fwd)
            if zs[j] < .05 and f > .55: return 1  # toe counter
            if zs[j] < .065 and f < -.6: return 1  # heel counter
            return 0
        pieces.append(wrap(f'{bid}_last_{L}', rings, [M[f'{bid}.leather'], M[f'{bid}.counter']], bpanel, count=40, ease=.007, shape=bshape, smooth=3, bone_name=bn, dilate=2))
        # sole: bottom ring extruded down as a rubber wedge
        sole_src = [v for v in foot_src if v.z < .04]
        c0 = Vector((rings[0][0].x, rings[0][0].y, .0))
        pieces.append(wrap(f'{bid}_sole_{L}', [
            (Vector((c0.x, c0.y, .0)), Z, .03, sole_src, 1.6), (Vector((c0.x, c0.y, .014)), Z, .03, sole_src, 2.0), (Vector((c0.x, c0.y, .03)), Z, .03, sole_src, 1.7),
        ], [b['sole']], count=40, ease=.007, smooth=3, bone_name=bn, sub=1, dilate=2))
        # tongue + laces or buckles on the front of the shaft
        ac = centroid(pts(.09, .012, lambda v: side * v.x > .02)) or ankle
        front_r = max((v - Vector((ac.x, ac.y, v.z))).dot(forward) for v in foot_src if abs(v.z - .1) < .02) + .012
        tz0, tz1 = .075, b['height'] - .012
        sidev = Vector((-forward.y, forward.x, 0))
        def shaft_front(z):
            return max((v - Vector((ac.x, ac.y, v.z))).dot(forward) for v in foot_src if abs(v.z - min(z, .11)) < .02) + .008 + (.004 if z > .12 else 0)
        if b['laces']:
            n = 4 if b['height'] < .17 else 5
            for i in range(n):
                z = tz0 + .012 + i * (tz1 - tz0 - .03) / (n - 1)
                base = Vector((ac.x, ac.y, z)) + forward * (shaft_front(z) + .001)
                pieces.append(strip(f'{bid}_lace', [base - sidev * .018, base + sidev * .018 + Vector((0, 0, .011))], .0016, b['lace'], bn))
                pieces.append(strip(f'{bid}_lace', [base + sidev * .018, base - sidev * .018 + Vector((0, 0, .011))], .0016, b['lace'], bn))
                for s2 in (-1, 1):
                    p = Vector((ac.x, ac.y, z)) + forward * (shaft_front(z) - .001) + sidev * s2 * .021
                    pieces.append(prim_sphere('eyelet', p, .0028, M['hw.buckle'], bn, (1, 1, .5)))
        else:
            for z in (.12, .22, .32):
                base = Vector((ac.x, ac.y, z)) + forward * (shaft_front(z) - .004)
                pieces.append(box(f'{bid}_buckle_strap', base, (.06, .012, .024), M['hw.strap_black'], bn, .002, (0, 0, math.atan2(forward.y, forward.x) + math.pi / 2)))
                pieces.append(box(f'{bid}_buckle', base + sidev * .028 + forward * .004, (.014, .008, .028), M['hw.buckle'], bn, .002))
        if side > 0:
            pad = Vector((ac.x, ac.y, .085)) + forward * (shaft_front(.085) - .012)
            pieces.append(box(f'{bid}_shift_pad', pad, (.042, .03, .007), M[f'{bid}.counter'], bn, .002, (0, 0, math.atan2(forward.y, forward.x) + math.pi / 2)))
        # pull loop at the back and a small brand tab at the ankle
        back_r = max((v - Vector((ac.x, ac.y, v.z))).dot(-forward) for v in foot_src if abs(v.z - .1) < .02) + .01
        pieces.append(box(f'{bid}_loop', Vector((ac.x, ac.y, b['height'] - .01)) - forward * (back_r - .002), (.02, .004, .022), M['hw.reflective'], bn, .001))
    join(pieces, 'gear_boots_' + bid)

# ======================================================================= helmets ===========
# Real helmet profile: ellipsoid cap, straight cheeks, forward-jutting chin bar (full face) or a
# jet rim following the cheeks (open face). The eye port is a clean rectangle in (z, angle) space.
mat('helmet_graphic', '#a62630', .4)
HCY = HEAD_Y + .02
TOP = H + .042
PORT_TOP, PORT_BOT, PORT_HALF = EYE_Z + .042, EYE_Z - .036, 1.1
Z_EQ = PORT_TOP
RX = [(EYE_Z - .13, .094), (EYE_Z - .105, .104), (EYE_Z - .085, .112), (EYE_Z - .06, .119), (PORT_BOT, .125), (EYE_Z, .128), (Z_EQ, .128)]
RYB = [(EYE_Z - .13, .085), (EYE_Z - .105, .092), (EYE_Z - .085, .099), (EYE_Z - .06, .106), (PORT_BOT, .112), (EYE_Z, .116), (Z_EQ, .118)]
RYF_FULL = [(EYE_Z - .13, .15), (EYE_Z - .105, .158), (EYE_Z - .085, .157), (EYE_Z - .06, .152), (PORT_BOT, .144), (EYE_Z, .138), (Z_EQ, .136)]
RYF_OPEN = [(EYE_Z - .13, .106), (EYE_Z - .105, .114), (EYE_Z - .085, .12), (EYE_Z - .06, .125), (PORT_BOT, .13), (EYE_Z, .134), (Z_EQ, .136)]
CAP_ROWS = 10
LOWER_Z_FULL = [Z_EQ, EYE_Z + .018, EYE_Z - .008, PORT_BOT, EYE_Z - .06, EYE_Z - .085, EYE_Z - .105, EYE_Z - .13]
LOWER_Z_OPEN = [Z_EQ, EYE_Z + .018, EYE_Z - .008, EYE_Z - .032, EYE_Z - .06, EYE_Z - .085, EYE_Z - .105, EYE_Z - .13]
COLS = 72

def rim_z(kind, a):
    a = abs((a + math.pi) % TAU - math.pi)
    back = EYE_Z - .072
    if kind == 'full':
        front = EYE_Z - .13
        return front + (back - front) * smoothstep(.95, 2.1, a)
    brow = EYE_Z + .045; jaw = EYE_Z - .105
    cheek = brow + (jaw - brow) * smoothstep(.75, 1.3, a)
    return cheek + (back - cheek) * smoothstep(1.6, 2.3, a)

def helmet_radius(kind, z, a, extra=0.0):
    rx = table(z, RX) + extra
    ryf = table(z, RYF_FULL if kind == 'full' else RYF_OPEN) + extra
    ryb = table(z, RYB) + extra
    if z > Z_EQ:
        # ellipsoid cap
        t = min(1.0, (z - Z_EQ) / (TOP - Z_EQ))
        k = math.sqrt(max(0.0, 1 - t * t))
        rx, ryf, ryb = rx * k, ryf * k, ryb * k
    ry = ryf if math.cos(a) > 0 else ryb
    return rx, ry

def helmet_point(kind, z, a, extra=0.0):
    rx, ry = helmet_radius(kind, z, a, extra)
    return Vector((rx * math.sin(a), HCY - ry * math.cos(a), z))

def helmet_rows(kind):
    """Row z as a function of angle: cap rows are horizontal, lower rows sink to the rim."""
    rows = []
    for j in range(CAP_ROWS):
        phi = (j / CAP_ROWS) * math.pi / 2
        z = Z_EQ + (TOP - Z_EQ) * math.cos(phi)
        rows.append(lambda a, z=z: z)
    lower = LOWER_Z_FULL if kind == 'full' else LOWER_Z_OPEN
    span = Z_EQ - lower[-1]
    for zj in lower:
        s = (Z_EQ - zj) / span
        rows.append(lambda a, s=s: Z_EQ - (Z_EQ - rim_z(kind, a)) * s)
    return rows

def surf_box(name, kind, z, a, dims, m, extra=.003, bevel=.002):
    from mathutils import Matrix
    p = helmet_point(kind, z, a, extra)
    tz = (helmet_point(kind, z + .004, a, extra) - helmet_point(kind, z - .004, a, extra)).normalized()
    ta = (helmet_point(kind, z, a + .03, extra) - helmet_point(kind, z, a - .03, extra)).normalized()
    n = ta.cross(tz).normalized()
    if n.dot(p - Vector((0, HCY, z))) < 0: n = -n
    rot = Matrix((ta, -n, tz)).transposed().to_euler()
    return box(name, p, dims, m, 'head', bevel, rot)

def project_helmet(kind, offset):
    def fn(co):
        a = math.atan2(co.x, -(co.y - HCY))
        return helmet_point(kind, co.z, a, offset)
    return fn

for kind in ('open', 'full'):
    rows = helmet_rows(kind)
    vv, ff, ids, uv = [], [], [], []
    for j, zfn in enumerate(rows):
        for k in range(COLS + 1):
            a = (k / COLS * 2 - 1) * math.pi
            vv.append(helmet_point(kind, zfn(a), a))
            uv.append((k / COLS, 1 - j / (len(rows) - 1)))
    port_rows = set()
    if kind == 'full':
        lower = LOWER_Z_FULL
        jt = CAP_ROWS; jb = CAP_ROWS + lower.index(PORT_BOT)
        port_rows = set(range(jt, jb))
    for j in range(len(rows) - 1):
        for k in range(COLS):
            a = ((k + .5) / COLS * 2 - 1) * math.pi
            if j in port_rows and abs(a) < PORT_HALF: continue
            if j >= len(rows) - 2 and kind == 'full' and abs(a) > 2.85: pass
            i = j * (COLS + 1) + k
            ff.append((i, i + COLS + 1, i + COLS + 2, i + 1))
            ids.append(0)
    shell_obj = mesh_part(f'helmet_{kind}_shell', vv, ff, [M['helmet'], M['helmet_graphic']], ids, 'head', uv)
    subdivide(shell_obj, 1)
    so = shell_obj.modifiers.new('Shell wall', 'SOLIDIFY'); so.thickness = .006; so.offset = -1
    sel([shell_obj], shell_obj); bpy.ops.object.modifier_apply(modifier=so.name)
    pieces = [shell_obj]
    # rubber rim trim following the rim
    rim_pts = [helmet_point(kind, rim_z(kind, a) + .002, a, .001) for a in [(k / 96 * 2 - 1) * math.pi for k in range(97)]]
    pieces.append(strip('helmet_rim', rim_pts, .0035, M['hw.rubber'], 'head', 3))
    proj = project_helmet(kind, .0025)
    if kind == 'full':
        # eye port gasket
        port = [helmet_point('full', PORT_TOP, a, .002) for a in [-PORT_HALF + 2 * PORT_HALF * k / 24 for k in range(25)]]
        port += [helmet_point('full', PORT_BOT, a, .002) for a in [PORT_HALF - 2 * PORT_HALF * k / 24 for k in range(25)]]
        port.append(port[0])
        pieces.append(strip('port_gasket', port, .003, M['hw.rubber'], 'head', 3))
        # chin bar vent with a slatted grille, wordmark above it
        cv = helmet_point('full', EYE_Z - .1, 0, .004)
        pieces.append(surf_box('chin_vent', 'full', EYE_Z - .1, 0, (.05, .008, .015), M['hw.plastic_black'], .002))
        for da in (-.11, 0, .11):
            pieces.append(surf_box('chin_slat', 'full', EYE_Z - .1, da, (.006, .004, .01), M['hw.rubber'], .0055, .001))
        pieces.append(label('helmet_wordmark', 'ROYAL ENFIELD', helmet_point('full', EYE_Z - .075, 0, .003), .0074, M['hw.badge_text'], 'head', project=proj))
        # lever for the internal sun visor on the left cheek
        pieces.append(surf_box('sun_lever', 'full', EYE_Z - .015, -1.5, (.02, .006, .01), M['hw.plastic_black'], .002))
    else:
        pieces.append(label('helmet_wordmark', 'ROYAL ENFIELD', helmet_point('open', EYE_Z - .08, math.pi, .003), .0065, M['hw.badge_text'], 'head', (math.pi / 2, 0, math.pi), project=proj))
        # jet helmets carry the MLG 1901 roundel at the back
        pieces.append(prim_sphere('mlg_roundel', helmet_point('open', EYE_Z + .02, math.pi, .003), .018, M['hw.badge'], 'head', (1, .12, 1)))
        pieces.append(label('mlg_text', 'MLG 1901', helmet_point('open', EYE_Z + .02, math.pi, .0045), .0045, M['hw.badge_text'], 'head', (math.pi / 2, 0, math.pi), project=project_helmet('open', .0045)))
    # top intake vents (two) and rear exhaust
    for a in (-.4, .4):
        pieces.append(surf_box('top_vent', kind, TOP - .03, a, (.022, .005, .03), M['hw.plastic_black'], .001))
    pieces.append(surf_box('rear_vent', kind, Z_EQ + .035, math.pi, (.055, .006, .014), M['hw.plastic_black'], .002))
    # brow vent on the full face, visor pivots on both
    if kind == 'full':
        pieces.append(surf_box('brow_vent', 'full', PORT_TOP + .016, 0, (.05, .005, .009), M['hw.plastic_black'], .001))
    piv_a = PORT_HALF + .3 if kind == 'full' else 1.38
    for side in (-1, 1):
        p = helmet_point(kind, EYE_Z + .002, side * piv_a, .004)
        pieces.append(prim_sphere('visor_pivot', p, .017, M['hw.plastic_black'], 'head', (.3, 1, 1)))
        pieces.append(prim_sphere('pivot_screw', p + Vector((side * .003, 0, 0)), .0055, M['hw.zipper'], 'head', (.25, 1, 1)))
    # rear badge
    pieces.append(prim_sphere('rear_badge', helmet_point(kind, Z_EQ - .015, math.pi, .003), .011, M['hw.badge'], 'head', (1, .15, 1)))
    join(pieces, 'gear_helmet_' + kind)

    # Visor: a curved polycarbonate sheet over the port, hinged at the pivots.
    vv, ff = [], []
    if kind == 'full':
        z0, z1, half, off = PORT_BOT - .014, PORT_TOP + .012, PORT_HALF + .17, .0075
    else:
        z0, z1, half, off = EYE_Z - .078, EYE_Z + .056, 1.3, .011
    for j in range(9):
        z = z0 + (z1 - z0) * j / 8
        for k in range(41):
            a = -half + 2 * half * k / 40
            # the visor bows slightly outward at the centre
            vv.append(helmet_point(kind, z, a, off + .004 * math.cos(a) ** 2))
    for j in range(8):
        for k in range(40):
            i = j * 41 + k
            ff.append((i, i + 1, i + 42, i + 41))
    visor = mesh_part('gear_helmet_visor_' + kind, vv, ff, [M['visor']], bone_name='head')
    # visor lower edge lip
    pieces = [visor, strip('visor_lip', [helmet_point(kind, z0 + .002, a, off + .004 * math.cos(a) ** 2 + .001) for a in [-half + 2 * half * k / 40 for k in range(41)]], .0018, M['hw.plastic_black'], 'head')]
    join(pieces, 'gear_helmet_visor_' + kind)

# Checks colourway applique: a checker band around the lower sides and back, red on matt black.
mat('helmet_check', '#dbdcda', .55)
vv, ff, ids = [], [], []
for row in range(3):
    for col in range(30):
        if (row + col) % 2: continue
        z_lo = EYE_Z - .1 + row * .022
        step = (TAU - 2.5) / 30
        a0 = 1.25 + col * step
        a1 = a0 + step
        start = len(vv)
        vv.extend([helmet_point('full', z, a, .0015) for z, a in [(z_lo, a0), (z_lo + .022, a0), (z_lo + .022, a1), (z_lo, a1)]])
        ff.append((start, start + 1, start + 2, start + 3))
        ids.append(1 if row == 1 else 0)
mesh_part('gear_helmet_checks', vv, ff, [M['helmet_check'], M['helmet_graphic']], ids, 'head')

# Rewing colourway: a winged stripe pair sweeping from the port back over the sides.
vv, ff, ids = [], [], []
N = 28
for side in (-1, 1):
    for band, (dz, w) in enumerate([(0, .014), (.024, .007)]):
        start = len(vv)
        for i in range(N + 1):
            t = i / N
            a = side * (PORT_HALF + .15 + t * 1.75)
            # sweeps up and back like a wing, tapering towards the tail
            zc = EYE_Z + .012 + .075 * t * t + dz * (1 - .3 * t)
            width = w * (1 - .55 * t)
            vv.append(helmet_point('full', zc, a, .0015))
            vv.append(helmet_point('full', zc + width, a, .0015))
        for i in range(N):
            k = start + i * 2
            face = (k, k + 1, k + 3, k + 2)
            ff.append(face if side > 0 else tuple(reversed(face)))
            ids.append(band)
mesh_part('gear_helmet_rewing', vv, ff, [M['helmet_graphic'], M['helmet_check']], ids, 'head')
