"""Thumbnail module, executed by build_rider.py after export: EEVEE face / hair previews.

Lit like the in-game fitting bay (warm key, cool fill, rim), 3/4 head view, transparent film so the
character screen's card gradient shows behind the head. Face thumbnails apply the preset morphs to
every shape-keyed mesh (body, brows, lashes, kajal), hair thumbnails show cap + out parts.
"""
import bpy, os
from mathutils import Vector

scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 24
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
world = bpy.data.worlds.new('thumb_world'); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.5, 0.52, 0.52, 1)
bg.inputs[1].default_value = 0.5

head_c = Vector((0, HEAD_Y - 0.025, EYE_Z - 0.045))
def light(kind, offset, energy, color, size):
    ld = bpy.data.lights.new('thumb_light', kind); ld.energy = energy; ld.color = color; ld.size = size
    lo = bpy.data.objects.new('thumb_light', ld); scene.collection.objects.link(lo)
    lo.location = head_c + Vector(offset)
    lo.rotation_mode = 'QUATERNION'
    lo.rotation_quaternion = (head_c - lo.location).to_track_quat('-Z', 'Y')
light('AREA', (-0.9, -1.2, 0.5), 60, (1, .95, .88), 0.8)
light('AREA', (1.0, -0.8, 0.2), 25, (.85, .9, 1), 0.8)
light('AREA', (0.4, 1.0, 0.6), 35, (1, 1, 1), 0.6)

cam_data = bpy.data.cameras.new('thumb_cam'); cam = bpy.data.objects.new('thumb_cam', cam_data)
scene.collection.objects.link(cam); scene.camera = cam
cam.rotation_mode = 'QUATERNION'
def aim(distance, lens=85):
    cam_data.lens = lens
    d = Vector((-0.36, -1.45, 0.06)).normalized()
    cam.location = head_c + d * distance
    cam.rotation_quaternion = (head_c - cam.location).to_track_quat('-Z', 'Y')

# Rest pose for every part, whatever the depsgraph cached from keyframing the clips.
for t in rig.animation_data.nla_tracks: t.mute = True
rig.animation_data.action = None
rig.data.pose_position = 'REST'
scene.frame_set(1)
bpy.context.view_layer.update()

optional = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(('hair_', 'gear_', 'beard_', 'accent_'))]
# EEVEE turns the near-clear cornea into a milky highlight at 256 px; the runtime draws it.
for o in bpy.data.objects:
    if o.name.startswith('Cornea'): o.hide_render = True
def show_only(names):
    for o in optional: o.hide_render = o.name not in names
def set_morphs(morphs):
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks:
                k.value = morphs.get(k.name, 0.0)
def render(path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

default_hair = 'crop' if GENDER == 'male' else 'long'
default_parts = [o.name for o in hair_parts.get(default_hair, [])]
accents = ['accent_kajal'] if GENDER == 'female' else []
assert_eyes_in_socket()
aim(0.95)
for f in presets['faces'][GENDER]:
    show_only(set(default_parts + accents))
    set_morphs(f['morphs'])
    render(os.path.join(THUMBS, f'face_{GENDER}_{f["id"]}.png'))
set_morphs({})
aim(1.05)
for hid in presets['hair'][GENDER]:
    show_only(set(o.name for o in hair_parts.get(hid, [])) | set(accents))
    render(os.path.join(THUMBS, f'hair_{GENDER}_{hid}.png'))
print('[thumbs] rendered', len(presets['faces'][GENDER]), 'faces and', len(presets['hair'][GENDER]), 'hair styles')
