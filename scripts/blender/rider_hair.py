"""Hair module, executed by build_rider.py after the wardrobe (reuses its wrap / weighted helpers).

Hair is built as shaped volumes rather than flat scalp shells: a natural hairline with per-style
temple recession and a low nape, rims that thin and round off instead of a stepped cut, volume
displacement per style, and strand-oriented UVs so the runtime strand texture reads as hair.
Styles that hang below the helmet rim are split into `hair_<id>` (cap) and `hair_<id>_out`.
Metres, Blender Z up / -Y forward.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

def gauss(v, s): return math.exp(-(v / s) ** 2)
def sgn(v): return 1.0 if v >= 0 else -1.0

M['hair_tie'] = material('hair_tie', lin(hexc('#8c1d2b')), 0.7)
M['turban'] = material('turban', lin(hexc('#e8730a')), 0.85)

# ------------------------------------------------------------------ hairline -------------
HL0 = 0.070 if GENDER == 'male' else 0.066
REC = {'crop': 0.008, 'side': 0.012, 'slick': 0.018, 'undercut': 0.014, 'buzz': 0.006, 'curly': 0.004,
       'quiff': 0.010, 'long': 0.006, 'turban': 0.0}
def hairline_z(x, rec=0.0):
    ax = abs(x)
    return EYE_Z + HL0 + rec * smooth((ax - 0.025) / 0.03) - 0.045 * smooth((ax - 0.048) / 0.022)
NAPE0 = CHIN_Z + 0.015
def nape_z(x):
    return NAPE0 + 0.05 * smooth((abs(x) - 0.035) / 0.035)
def is_ear(c):
    return abs(c.x) > 0.064 and HEAD_Y - 0.02 < c.y < HEAD_Y + 0.055 and EYE_Z - 0.04 < c.z < EYE_Z + 0.032
def scalp(rec=0.0):
    def pred(c):
        if is_ear(c): return False
        if c.y < HEAD_Y - 0.01:
            return c.z > hairline_z(c.x, rec)
        if abs(c.x) > 0.078 and c.z < EYE_Z + 0.085: return False
        return c.z > nape_z(c.x)
    return pred
def front(c): return c.y < HEAD_Y - 0.02
def back_y(z):
    return max(v.y for v in verts if abs(v.x) < 0.02 and abs(v.z - z) < 0.012)
def add(*fns):
    return lambda c: sum(f(c) for f in fns)

# ------------------------------------------------------------------ shell builder --------
def apply_mod(obj, md):
    sel([obj], obj)
    bpy.ops.object.modifier_apply(modifier=md.name)

def hair_uv(obj, mode):
    me = obj.data
    layer = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if mode == 'down':
                uv = ((math.atan2(co.x, co.y - HEAD_Y) / TAU + 0.5) * 6, co.z * 6)
            elif mode == 'back':
                uv = (co.x * 6, (co.y - HEAD_YMIN) * 6)
            else:
                uv = ((co.x + co.y) * 6, co.z * 6)
            layer.data[li].uv = uv

def hair_shell(name, pred, thickness, displace=None, rim_taper=0.02, min_thick=0.3, keep_edge=None,
               smooth_iters=6, uv='down', mat=None, clearance=0.0006):
    """Body faces selected by pred, thinned toward the free edge, optionally displaced along the
    normal for volume, solidified outward, rim-smoothed, kept outside the skin, and skinned."""
    mat = mat or M['hair']
    bm = bmesh.new()
    bm.from_mesh(body.data)
    doomed = [f for f in bm.faces if sum(1 for v in f.verts if pred(v.co)) / len(f.verts) < 0.5]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    if not bm.faces:
        print('[hair] WARNING empty shell', name); bm.free(); return None
    bm.verts.index_update(); bm.normal_update()
    boundary = [v for v in bm.verts if v.is_boundary and not (keep_edge and keep_edge(v.co))]
    # Straighten the zigzag of the face-selection cut: relax boundary verts along the boundary
    # loop, then put them back onto the skin.
    bset = set(v.index for v in boundary)
    for _ in range(5):
        moves = {}
        for v in boundary:
            nb = [e.other_vert(v) for e in v.link_edges if e.other_vert(v).index in bset]
            if len(nb) >= 2:
                moves[v.index] = (v.co * 2 + sum((n.co for n in nb), Vector())) / (2 + len(nb))
        for v in boundary:
            if v.index in moves:
                v.co = skin_offset(moves[v.index], 0.0)
    bm.normal_update()
    rim_w = {v.index: 0.0 for v in bm.verts}
    if boundary and rim_taper > 0:
        kd = KDTree(len(boundary))
        for i, v in enumerate(boundary): kd.insert(v.co, i)
        kd.balance()
        for v in bm.verts:
            _, _, d = kd.find(v.co)
            rim_w[v.index] = 1 - smooth(d / rim_taper)
    if displace:
        for v in bm.verts:
            amt = displace(v.co) * (1 - rim_w[v.index])
            if amt: v.co += v.normal * amt
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    for vg in body.vertex_groups:
        obj.vertex_groups.new(name=vg.name)
    g_thick = obj.vertex_groups.new(name='thick'); g_rim = obj.vertex_groups.new(name='rim')
    for v in me.vertices:
        w = rim_w.get(v.index, 0.0)
        g_thick.add([v.index], 1 - w, 'REPLACE')
        g_rim.add([v.index], w, 'REPLACE')
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    so = obj.modifiers.new('Solidify', 'SOLIDIFY')
    so.thickness = thickness; so.offset = 1; so.use_even_offset = False; so.use_rim = True
    so.vertex_group = 'thick'; so.thickness_vertex_group = min_thick
    apply_mod(obj, so)
    if smooth_iters and boundary:
        sm = obj.modifiers.new('Rim', 'SMOOTH'); sm.factor = 1.0; sm.iterations = smooth_iters * 2; sm.vertex_group = 'rim'
        apply_mod(obj, sm)
    for v in me.vertices:
        v.co = skin_offset(v.co, clearance)
    for p in me.polygons: p.use_smooth = True
    hair_uv(obj, uv)
    md = obj.modifiers.new('Armature', 'ARMATURE'); md.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse.identity()
    return obj

def clumps(obj, scale, strength, name='clumps'):
    tex = bpy.data.textures.new(f'{obj.name}_{name}', 'CLOUDS'); tex.noise_scale = scale
    dm = obj.modifiers.new(name, 'DISPLACE'); dm.texture = tex; dm.strength = strength; dm.mid_level = 0.5
    dm.vertex_group = 'thick'
    apply_mod(obj, dm)
    return obj

def ellipsoid(name, center, radii, mat, roll=0.0, group=None, segments=20, rings=12):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    mtx = Matrix.Translation(center) @ Matrix.Rotation(roll, 4, 'Z') @ Matrix.Diagonal((*radii, 1))
    bmesh.ops.transform(bm, matrix=mtx, verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new(name, me); scene.collection.objects.link(obj)
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    layer = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co - center
            layer.data[li].uv = ((math.atan2(co.x, co.y) / TAU + 0.5) * 2, co.z * 8)
    if group: rig_to(obj, group)
    else: weighted(obj)
    return obj

def sweep_tube(name, points, radii, mat, segments=14, closed=False, group=None, caps=True, uv_scale=8, aspect=1.0):
    """Tube along a polyline with a radius per point (tapered hair strands, wrapped cloth)."""
    n = len(points)
    vv, ff, uv = [], [], []
    for i, p in enumerate(points):
        if closed:
            d = points[(i + 1) % n] - points[i - 1]
        else:
            d = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)])
        d, f, s = frame(d)
        for k in range(segments):
            a = TAU * k / segments
            vv.append(p + (f * math.cos(a) + s * math.sin(a) * aspect) * radii[i])
            uv.append((k / segments * 2, i / max(n - 1, 1) * uv_scale))
    rings = n if closed else n - 1
    for i in range(rings):
        i2 = (i + 1) % n
        for k in range(segments):
            k2 = (k + 1) % segments
            ff.append((i * segments + k, i * segments + k2, i2 * segments + k2, i2 * segments + k))
    if caps and not closed:
        for idx, p in ((0, points[0]), (n - 1, points[-1])):
            c = len(vv); vv.append(p); uv.append((1, 0))
            for k in range(segments):
                k2 = (k + 1) % segments
                tri = (c, idx * segments + k2, idx * segments + k) if idx == 0 else (c, idx * segments + k, idx * segments + k2)
                ff.append(tri)
    me = bpy.data.meshes.new(name)
    me.from_pydata(vv, [], ff); me.update()
    obj = bpy.data.objects.new(name, me); scene.collection.objects.link(obj)
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    layer = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            layer.data[li].uv = uv[me.loops[li].vertex_index]
    recalc(obj)
    if group: rig_to(obj, group)
    else: weighted(obj)
    return obj

def join_hair(objs, name):
    o = join(objs, name)
    if o:
        for p in o.data.polygons: p.use_smooth = True
    return o

hair_parts = {}
def register(hid, cap, out=None):
    hair_parts[hid] = [o for o in (cap, out) if o]

# ------------------------------------------------------------------ brows ----------------
brows = hair_shell('brows', is_brow, 0.0010 if GENDER == 'male' else 0.0008, rim_taper=0.004, min_thick=0.4,
                   smooth_iters=3, mat=M['brow'], clearance=0.0004)
if brows:
    layer = brows.data.uv_layers['UVMap']
    for p in brows.data.polygons:
        for li in p.loop_indices:
            co = brows.data.vertices[brows.data.loops[li].vertex_index].co
            layer.data[li].uv = ((co.x - sgn(co.x) * 0.034) * 14 + 0.5, (co.z - EYE_Z - 0.02) * 14 + 0.5)
    add_field_keys(brows, MORPHS)

# ------------------------------------------------------------------ shared styles --------
def style_crop(rec=REC['crop']):
    o = hair_shell('hair_crop', scalp(rec), 0.012)
    return clumps(o, 0.012, 0.004)

def style_buzz(rec=REC['buzz']):
    return hair_shell('hair_buzz', scalp(rec), 0.004, min_thick=0.6, smooth_iters=3)

PART_X = 0.022
def parting(x0=PART_X, depth=0.006, width=0.006):
    return lambda c: -depth * gauss(c.x - x0, width) if (c.z > EYE_Z + 0.05 and c.y < HEAD_Y + 0.03) else 0.0

def style_side(rec=REC['side']):
    sweep = lambda c: 0.007 * smooth((PART_X - c.x) / 0.035) * bump(c.z, EYE_Z + 0.05, EYE_Z + 0.12) if c.y < HEAD_Y + 0.02 else 0.0
    return hair_shell('hair_side', scalp(rec), 0.014, displace=add(parting(), sweep))

def style_curly(rec=REC['curly']):
    o = hair_shell('hair_curly', scalp(rec), 0.026, rim_taper=0.025)
    clumps(o, 0.02, 0.014, 'curls')
    clumps(o, 0.006, 0.004, 'frizz')
    return o

def style_slick(rec=REC['slick']):
    vol = lambda c: 0.010 * smooth((c.z - EYE_Z - 0.06) / 0.05) * (1.0 if c.y > HEAD_Y - 0.04 else smooth((c.y - (HEAD_Y - 0.08)) / 0.04))
    return hair_shell('hair_slick', scalp(rec), 0.016, displace=vol, uv='back')

def style_undercut(rec=REC['undercut']):
    sc = scalp(rec)
    top = lambda c: c.z > EYE_Z + 0.068 + 0.02 * smooth((abs(c.x) - 0.05) / 0.02) and abs(c.x) < 0.07
    sides = hair_shell('hair_undercut_sides', lambda c: sc(c) and not top(c), 0.005, min_thick=0.6, smooth_iters=2)
    crown = hair_shell('hair_undercut_top', lambda c: sc(c) and top(c), 0.018, rim_taper=0.022, min_thick=0.3, smooth_iters=4)
    clumps(crown, 0.012, 0.003)
    return join_hair([sides, crown], 'hair_undercut')

def style_quiff(rec=REC['quiff']):
    lift = lambda c: 0.03 * bump(c.z, EYE_Z + 0.07, EYE_Z + 0.125) * smooth(((HEAD_Y - 0.03) - c.y) / 0.03)
    return hair_shell('hair_quiff', scalp(rec), 0.014, displace=lift)

SPLIT_Z = EYE_Z - 0.072  # helmet rim at the back; hair below it stays visible with a helmet
near_split = lambda c: abs(c.z - SPLIT_Z) < 0.006
def back_region(c, lo, half_w):
    return lo < c.z and c.y > HEAD_Y + 0.02 and abs(c.x) < half_w and not is_ear(c)

def style_long(rec=REC['long'], lo=None, half_w=0.13, thickness=0.016, out_thickness=0.024, displace=None):
    lo = NECK_Z - 0.03 if lo is None else lo
    sc = scalp(rec)
    cap = hair_shell('hair_long', lambda c: sc(c) or (back_region(c, SPLIT_Z, half_w) and c.z <= EYE_Z + 0.04),
                     thickness, displace=displace, keep_edge=near_split)
    out = hair_shell('hair_long_out', lambda c: back_region(c, lo, half_w) and c.z <= SPLIT_Z,
                     out_thickness, keep_edge=near_split, rim_taper=0.03)
    return cap, out

# ------------------------------------------------------------------ male -----------------
if GENDER == 'male':
    register('crop', style_crop())
    register('buzz', style_buzz())
    register('side', style_side())
    register('slick', style_slick())
    register('undercut', style_undercut())
    register('curly', style_curly())
    register('quiff', style_quiff())
    cap, out = style_long()
    register('long', cap, out)
    register('bald', None)

    # Turban (pagri): a dome over the scalp with six wrapped layers that cross at the front V.
    head_src = [v for v in verts if v.z > EYE_Z - 0.02]
    dome = hair_shell('hair_turban_dome', lambda c: (not is_ear(c)) and (c.z > EYE_Z + 0.042 if c.y < HEAD_Y - 0.01 else c.z > EYE_Z + 0.004),
                      0.02, rim_taper=0.0, smooth_iters=0, uv='axis', mat=M['turban'], clearance=0.002)
    pieces = [dome]
    N_LAYERS = 7
    for i in range(N_LAYERS):
        z_i = EYE_Z + 0.030 + 0.0145 * i
        tilt = 0.026 - 0.003 * i
        c = Vector((0, HEAD_Y + 0.004, z_i))
        d, f, s = frame(Vector((0, 0, 1)))
        radii = sector_radii(c, d, f, s, head_src, 0.03, 48)
        pts, rr = [], []
        for k in range(64):
            a = TAU * k / 64
            sector = radii[int(a / TAU * 48) % 48]
            r = sector + 0.019 + 0.0025 * i
            z = z_i + tilt * math.cos(a) + 0.010 * math.sin(a) * (1 if i % 2 else -1)
            p = c + (f * math.cos(a) + s * math.sin(a)) * r
            pts.append(Vector((p.x, p.y, z))); rr.append(0.0085)
        pieces.append(sweep_tube(f'turban_layer_{i}', pts, rr, M['turban'], segments=12, closed=True, group='head', uv_scale=1, aspect=1.8))
    # tucked end (larh) across the crown, from the back over to the front-left
    top_z = H + 0.018
    larh = [Vector((0.0, HEAD_Y + 0.07, top_z - 0.02)), Vector((0.01, HEAD_Y + 0.03, top_z + 0.002)),
            Vector((0.025, HEAD_Y - 0.02, top_z + 0.004)), Vector((0.045, HEAD_Y - 0.06, top_z - 0.012)),
            Vector((0.06, HEAD_Y - 0.085, top_z - 0.035))]
    pieces.append(sweep_tube('turban_larh', larh, [0.012, 0.012, 0.011, 0.010, 0.006], M['turban'], segments=12, group='head', uv_scale=2, aspect=0.6))
    register('turban', join_hair(pieces, 'hair_turban'))

# ------------------------------------------------------------------ female ---------------
else:
    register('crop', style_crop(0.0))
    register('buzz', style_buzz(0.0))
    register('side', style_side(0.0))
    register('curly', style_curly(0.0))

    # Open long hair with a centre parting, back to the shoulders, two sections in front.
    # Open hair: centre parting, falls behind the ears down the neck sides to the collar.
    neck_sides = lambda c: 0.035 < abs(c.x) < 0.078 and c.y > HEAD_Y - 0.03 and NECK_Z - 0.012 < c.z <= SPLIT_Z and not is_ear(c)
    sc = scalp(0.0)
    cap = hair_shell('hair_long', lambda c: sc(c) or (back_region(c, SPLIT_Z, 0.12) and c.z <= EYE_Z + 0.04),
                     0.016, displace=parting(0.0, 0.005, 0.004), keep_edge=near_split)
    out = hair_shell('hair_long_out', lambda c: (back_region(c, NECK_Z - 0.045, 0.11) and c.z <= SPLIT_Z) or neck_sides(c),
                     0.02, keep_edge=near_split, rim_taper=0.03)
    register('long', cap, out)

    # Braid (choti): gathered cap, then alternately offset, rolled plaits down the back.
    gather = lambda c: 0.004 * smooth((c.y - (HEAD_Y + 0.02)) / 0.05) * smooth((c.z - (EYE_Z - 0.06)) / 0.05) if c.z < EYE_Z + 0.06 else 0.0
    cap = hair_shell('hair_braid', lambda c: scalp(0.0)(c) or (back_region(c, SPLIT_Z, 0.09) and c.z <= EYE_Z + 0.04),
                     0.012, displace=add(parting(0.0, 0.004, 0.004), gather), keep_edge=near_split)
    segs = []
    root_z = SPLIT_Z - 0.004
    N_SEG = 11
    for i in range(N_SEG):
        t = i / (N_SEG - 1)
        r = 0.024 - 0.011 * t
        z = root_z - 0.40 * t
        by = back_y(z)
        c = Vector(((0.011 * (1 - 0.5 * t)) * (1 if i % 2 else -1), by + r * 0.62, z))
        segs.append(ellipsoid(f'braid_{i}', c, (r, r * 0.62, r * 1.5), M['hair'], roll=math.radians(25 if i % 2 else -25)))
    tie_z = root_z - 0.40 - 0.014
    tie_y = back_y(tie_z) + 0.009
    bpy.ops.mesh.primitive_torus_add(major_radius=0.0125, minor_radius=0.003, major_segments=20, minor_segments=8,
                                     location=(0, tie_y, tie_z), rotation=(0, 0, 0))
    tie = bpy.context.active_object; tie.name = 'braid_tie'
    sel([tie], tie); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    tie.data.materials.append(M['hair_tie'])
    for p in tie.data.polygons: p.use_smooth = True
    weighted(tie)
    tuft = sweep_tube('braid_tuft', [Vector((0, tie_y, tie_z - 0.004)), Vector((0.004, tie_y + 0.004, tie_z - 0.03)), Vector((0.008, tie_y + 0.008, tie_z - 0.06))],
                      [0.011, 0.009, 0.003], M['hair'])
    register('braid', cap, join_hair(segs + [tie, tuft], 'hair_braid_out'))

    # Low bun.
    bun_cap = hair_shell('hair_bun', lambda c: scalp(0.0)(c) or (back_region(c, SPLIT_Z, 0.09) and c.z <= EYE_Z + 0.04),
                         0.012, displace=add(parting(0.0, 0.004, 0.004), gather), keep_edge=near_split)
    bun_z = EYE_Z - 0.03
    bun = ellipsoid('bun_ball', Vector((0, back_y(bun_z) + 0.03, bun_z)), (0.046, 0.036, 0.04), M['hair'], group='head', segments=28, rings=16)
    register('bun', join_hair([bun_cap, bun], 'hair_bun'))

    # Bob: cap plus a wrapped skirt around the sides and back down to the jaw, open at the face.
    bob_cap = hair_shell('hair_bob_cap', scalp(0.0), 0.016, displace=parting(0.0, 0.005, 0.004))
    head_src = [v for v in verts if v.z > CHIN_Z - 0.06]
    rings = [(Vector((0, HEAD_Y, z)), Vector((0, 0, 1)), 0.012, head_src, 1.0)
             for z in (EYE_Z - 0.05, EYE_Z - 0.032, EYE_Z - 0.012, EYE_Z + 0.01, EYE_Z + 0.032, EYE_Z + 0.055)]
    def bob_shape(j, a, rr):
        a = (a + math.pi) % TAU - math.pi
        face = smooth((1.0 - abs(a)) / 0.3)
        flare = 1.0 + 0.10 * (1 - j / 5)
        return rr * flare * (1 - 0.45 * face)
    skirt = wrap('hair_bob_skirt', rings, [M['hair']], count=48, ease=0.012, smooth=2, shape=bob_shape, sub=0, uv_scale=6)
    so = skirt.modifiers.new('Solidify', 'SOLIDIFY'); so.thickness = 0.012; so.offset = -1; so.use_rim = True
    apply_mod(skirt, so)
    register('bob', join_hair([bob_cap, skirt], 'hair_bob'))

    # Low ponytail: gathered cap; the tail starts below the helmet rim.
    pony_cap = hair_shell('hair_ponytail', lambda c: scalp(0.0)(c) or (back_region(c, SPLIT_Z, 0.09) and c.z <= EYE_Z + 0.04),
                          0.012, displace=gather, keep_edge=near_split)
    rz = SPLIT_Z - 0.006
    ry = back_y(rz)
    tail_pts = [Vector((0, ry + 0.012, rz)), Vector((0, ry + 0.04, rz - 0.05)), Vector((0, ry + 0.06, rz - 0.12)),
                Vector((0, ry + 0.058, rz - 0.20)), Vector((0, ry + 0.045, rz - 0.28)), Vector((0, ry + 0.03, rz - 0.34))]
    tail = sweep_tube('pony_tail', tail_pts, [0.02, 0.024, 0.024, 0.02, 0.014, 0.004], M['hair'], segments=16)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.02, minor_radius=0.004, major_segments=24, minor_segments=8,
                                     location=(0, ry + 0.02, rz - 0.012), rotation=(math.radians(60), 0, 0))
    ptie = bpy.context.active_object; ptie.name = 'pony_tie'
    sel([ptie], ptie); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ptie.data.materials.append(M['hair_tie'])
    for p in ptie.data.polygons: p.use_smooth = True
    weighted(ptie)
    register('ponytail', pony_cap, join_hair([tail, ptie], 'hair_ponytail_out'))

print('[hair] styles:', {k: [o.name for o in v] for k, v in hair_parts.items()})
