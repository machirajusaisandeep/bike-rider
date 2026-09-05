"""Render the exported rider GLB in Stand and Ride poses for a visual check.
  Blender -b --python check_pose.py -- rider.glb out_prefix
"""
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scene = bpy.context.scene
rig = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_cavity = True
scene.render.resolution_x, scene.render.resolution_y = 900, 900
scene.view_settings.view_transform = 'Standard'
cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
scene.camera = cam
def look(pos, target):
    cam.location = pos
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y')
# show only body, eyes, one hair, brows, and a gear set
show = {'Body', 'Eye.L', 'Eye.R', 'hair_crop', 'hair_long', 'brows', 'gear_jacket', 'gear_jacket_armour', 'gear_boots_ankle', 'gear_gloves_gauntlet', 'gear_knee_shell'}
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_render = o.name not in show
print('[check] meshes:', sorted(o.name for o in bpy.data.objects if o.type == 'MESH'))
print('[check] actions:', [a.name for a in bpy.data.actions])
def play(name):
    act = bpy.data.actions.get(name)
    rig.animation_data_create(); rig.animation_data.action = act
    scene.frame_set(1)
play('Stand')
look((2.6, -3.2, 1.2), (0, 0, 0.9))
scene.render.filepath = OUT + '_stand.png'; bpy.ops.render.render(write_still=True)
play('Ride')
look((2.6, -2.2, 1.1), (0, 0, 0.8))
scene.render.filepath = OUT + '_ride.png'; bpy.ops.render.render(write_still=True)
look((0.2, -2.6, 1.0), (0, 0, 0.8))
scene.render.filepath = OUT + '_ride_front.png'; bpy.ops.render.render(write_still=True)
print('[check] done')
