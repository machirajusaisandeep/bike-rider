"""Render an exported rider GLB with a chosen loadout, from several angles, using EEVEE.

Quick offline check of a rebuilt wardrobe without starting the browser:

Blender -b --python scripts/blender/render_rider.py -- public/models/rider_male.glb out/ \\
    hair_crop,gear_helmet_full,gear_helmet_visor_full,gear_jacket_wf,gear_boots_marshall [front,quarter,side,back,head,headside,feet,knee,hand]
"""
import bpy, sys, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT, PARTS = argv[0], argv[1], set(argv[2].split(',')) if len(argv) > 2 and argv[2] else set()
VIEWS = argv[3].split(',') if len(argv) > 3 else ['front', 'quarter', 'side', 'head', 'back']
# optional: presets.json:faceId applies that preset's morphs to every shape-keyed mesh
FACE = argv[4].split(':') if len(argv) > 4 and argv[4] else None
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scene = bpy.context.scene

# visibility: body/eyes/iris/brows always; hair/gear/beard only when listed
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    top = o
    while top.parent and top.parent.type == 'MESH':
        top = top.parent
    n = top.name
    optional = n.startswith(('hair_', 'gear_', 'beard_', 'accent_'))
    show = (not optional) or n in PARTS
    o.hide_render = not show
    o.hide_viewport = not show
if FACE:
    import json
    presets = json.load(open(FACE[0]))
    face = next(f for g in presets['faces'].values() for f in g if f['id'] == FACE[1])
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks:
                k.value = face['morphs'].get(k.name, 0.0)
    print('[render] face', FACE[1], face['morphs'])

body = bpy.data.objects.get('Body')
H = max((body.matrix_world @ v.co).z for v in body.data.vertices) if body else 1.7

scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 32
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.55, 0.57, 0.56, 1)
bg.inputs[1].default_value = 0.9

def light(kind, loc, energy, color=(1, 1, 1), size=2):
    ld = bpy.data.lights.new('l', kind); ld.energy = energy; ld.color = color
    if kind == 'AREA': ld.size = size
    lo = bpy.data.objects.new('l', ld); scene.collection.objects.link(lo)
    lo.location = loc
    lo.rotation_mode = 'QUATERNION'
    lo.rotation_quaternion = (Vector((0, 0, H * .6)) - Vector(loc)).to_track_quat('-Z', 'Y')
light('AREA', (-2.5, -3.5, 3.2), 900, (1, .95, .88), 3)
light('AREA', (3, -2, 2.2), 350, (.85, .9, 1), 3)
light('AREA', (1, 3, 3), 500, (1, 1, 1), 2)

# floor
bpy.ops.mesh.primitive_plane_add(size=30)
fl = bpy.context.object
m = bpy.data.materials.new('floor'); m.use_nodes = True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.32, .34, .33, 1)
fl.data.materials.append(m)

cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam); scene.camera = cam
cam.rotation_mode = 'QUATERNION'

def shoot(name, target, offset, lens):
    cam_data.lens = lens
    cam.location = Vector(target) + Vector(offset)
    cam.rotation_quaternion = (Vector(target) - cam.location).to_track_quat('-Z', 'Y')
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)

mid = (0, 0, H * .52)
if 'front' in VIEWS: shoot('front', mid, (0, -4.6, .2), 55)
if 'quarter' in VIEWS: shoot('quarter', mid, (-3.2, -3.4, .3), 55)
if 'side' in VIEWS: shoot('side', mid, (-4.6, 0, .2), 55)
if 'back' in VIEWS: shoot('back', mid, (0, 4.6, .2), 55)
head = (0, -.04, H - .13)
if 'head' in VIEWS: shoot('head', head, (-.55, -1.2, .08), 85)
if 'headside' in VIEWS: shoot('headside', head, (-1.3, 0, .05), 85)
if 'feet' in VIEWS: shoot('feet', (0, -.05, .15), (-.8, -1.2, .45), 70)
if 'knee' in VIEWS: shoot('knee', (0, -.03, H * .28), (-.7, -1.4, .2), 70)
if 'hand' in VIEWS: shoot('hand', (.37, -.06, H * .52), (.6, -1.0, .1), 85)
print('[render] done', OUT)
