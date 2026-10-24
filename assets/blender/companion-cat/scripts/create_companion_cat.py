"""Create Xiaoyu: editable, texture-free companion cat with animation pivots.

Blender coordinates: metres, Z-up, looking towards -Y. GLB: standard Y-up.
Run: blender --background --factory-startup --python-exit-code 1 --python THIS_FILE
"""

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT_DIR = Path(__file__).resolve().parents[1]
COLLECTION = None
MATERIALS = {}


def color(value):
    rgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb)


def make_material(name, value, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    rgba = (*color(value), 1)
    mat.diffuse_color = rgba
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgba
    shader.inputs['Roughness'].default_value = roughness
    MATERIALS[name] = mat
    return mat


def attach(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def origin(obj, point):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    new_world = world.copy()
    new_world.translation = Vector(point)
    obj.data.transform(new_world.inverted() @ world)
    obj.matrix_world = new_world


def finish(obj, name, mat=None, parent=None, pivot=None, smooth=True):
    obj.name = name
    obj.data.name = name + '_Mesh'
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    COLLECTION.objects.link(obj)
    if mat:
        obj.data.materials.append(MATERIALS[mat])
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    if pivot is not None:
        origin(obj, pivot)
    if parent:
        attach(obj, parent)
    return obj


def empty(name, point=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    COLLECTION.objects.link(obj)
    obj.location = point
    obj.empty_display_size = 0.05
    if parent:
        attach(obj, parent)
    return obj


def mesh(name, vertices, faces, mat, parent=None, pivot=None, smooth=True):
    data = bpy.data.meshes.new(name + '_Mesh')
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    COLLECTION.objects.link(obj)
    return finish(obj, name, mat, parent, pivot, smooth)


def ellipsoid(name, position, scale, mat, parent=None, segments=24, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=position)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent)


def rounded_box(name, position, scale, mat, parent, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new('Soft_Edges', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 3
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return finish(obj, name, mat, parent)


def join(parts, name, parent, pivot=None):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + '_Mesh'
    if pivot is not None:
        origin(obj, pivot)
    attach(obj, parent)
    return obj


def tube(name, points, radii, mat, parent, pivot, sides=12):
    if len(points) > 4:
        # A few Catmull-Rom samples soften the tail without adding separate blobs.
        sampled, widths = [], []
        for i in range(len(points) - 1):
            a, b, c, d = [Vector(points[max(0, min(j, len(points) - 1))]) for j in (i - 1, i, i + 1, i + 2)]
            for step in range(3):
                t = step / 3
                sampled.append(0.5 * (2 * b + (-a + c) * t + (2*a - 5*b + 4*c - d)*t*t + (-a + 3*b - 3*c + d)*t*t*t))
                widths.append(radii[i] * (1-t) + radii[i+1] * t)
        points, radii = sampled + [Vector(points[-1])], widths + [radii[-1]]
    vertices, faces = [], []
    for i, point in enumerate(points):
        center = Vector(point)
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(0, i - 1)])
        tangent.normalize()
        side = tangent.cross(Vector((0, 1, 0)))
        if side.length < 0.01:
            side = tangent.cross(Vector((1, 0, 0)))
        side.normalize()
        other = tangent.cross(side).normalized()
        for j in range(sides):
            angle = math.tau * j / sides
            vertices.append(center + radii[i] * (math.cos(angle) * side + math.sin(angle) * other))
    for i in range(len(points) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((i * sides + j, i * sides + k, (i + 1) * sides + k, (i + 1) * sides + j))
    faces.extend([tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + j for j in range(sides))])
    return mesh(name, vertices, faces, mat, parent, pivot)


def line(name, points, radius, mat, parent):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 4
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, xyz in zip(spline.bezier_points, points):
        point.co = xyz
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    COLLECTION.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object, name, mat, parent)


def disc(name, center, radius, depth, mat, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=center, rotation=(math.pi / 2, 0, 0))
    return finish(bpy.context.object, name, mat, parent)


def leaf(name, center, width, length, mat, parent, angle=0):
    # A folded, thickened leaf; the ridge gives readable volume from all views.
    outline = [(-0.45, 0), (-0.5, -0.35), (-0.28, -0.8), (0, -1), (0.28, -0.8), (0.5, -0.35), (0.45, 0)]
    vertices = []
    for x, z in outline + [(0, -0.4)]:
        px, pz = x * width, z * length
        vertices.append((center[0] + px * math.cos(angle) - pz * math.sin(angle), center[1] - (0.009 if x == 0 and z == -0.4 else 0), center[2] + px * math.sin(angle) + pz * math.cos(angle)))
    faces = [(i, (i + 1) % 7, 7) for i in range(7)]
    obj = mesh(name, vertices, faces, mat, parent, smooth=False)
    solidify = obj.modifiers.new('Leaf_Thickness', 'SOLIDIFY')
    solidify.thickness = 0.008
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    return obj


def build():
    root = empty('CompanionCat_Root')
    root['height_target_m'] = 1.18
    root['front_axis_blender'] = '-Y'
    root['animation_states'] = 'Idle, Greeting, Responding; animated by R3F using named pivots'
    body = ellipsoid('Body', (0, 0.015, 0.37), (0.174, 0.123, 0.235), 'Cream', root)
    body.data.materials.append(MATERIALS['Orange'])
    for polygon in body.data.polygons:
        if polygon.center.y > 0.025 or abs(polygon.center.x) > 0.15:
            polygon.material_index = 1
    head = empty('Head', (0, 0, 0.605), body)
    surface = ellipsoid('Head_Surface', (0, -0.012, 0.805), (0.305, 0.221, 0.221), 'Cream', head, 32, 18)
    surface.data.materials.append(MATERIALS['Orange'])
    for polygon in surface.data.polygons:
        point = surface.matrix_world @ polygon.center
        if (point.z > 0.805 and abs(point.x) > 0.045 + (1.025 - point.z) * 0.22) or (point.y > 0.04 and abs(point.x) > 0.09):
            polygon.material_index = 1

    for sign, side in [(-1, 'L'), (1, 'R')]:
        base_x = sign * 0.205
        # Rounded triangular prism with a coloured inset; not a flat triangle.
        front = [(sign * 0.12, -0.055, 0.948), (sign * 0.30, -0.015, 0.943), (sign * 0.285, -0.005, 1.176)]
        back = [(x, y + 0.09 * (1 if z < 1.1 else 0.3), z) for x, y, z in front]
        ear = mesh('Ear_' + side, front + back, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], 'Orange', head, (base_x, 0.01, 0.95))
        modifier = ear.modifiers.new('Ear_Rounded_Edges', 'BEVEL')
        modifier.width = 0.012
        modifier.segments = 2
        bpy.context.view_layer.objects.active = ear
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        inset = mesh('Inner_Ear_' + side, [(sign * 0.156, -0.064, 0.970), (sign * 0.277, -0.026, 0.964), (sign * 0.275, -0.018, 1.132)], [(0, 1, 2)], 'Pink', ear)
        solidify = inset.modifiers.new('Inset_Thickness', 'SOLIDIFY')
        solidify.thickness = 0.004
        bpy.context.view_layer.objects.active = inset
        bpy.ops.object.modifier_apply(modifier=solidify.name)

        eye_x = sign * 0.122
        eye_parts = [
            ellipsoid('Eye_White_' + side, (eye_x, -0.201, 0.838), (0.074, 0.031, 0.086), 'Eye_White', None, 20, 12),
            ellipsoid('Eye_Iris_' + side, (eye_x, -0.228, 0.836), (0.050, 0.014, 0.064), 'Eye_Green', None, 20, 10),
            ellipsoid('Eye_Pupil_' + side, (eye_x, -0.240, 0.841), (0.024, 0.009, 0.047), 'Pupil', None, 16, 10),
            ellipsoid('Eye_Glint_' + side, (eye_x - 0.014, -0.248, 0.868), (0.010, 0.006, 0.012), 'Eye_White', None, 10, 6),
        ]
        join(eye_parts, 'Eye_' + side, head, (eye_x, -0.20, 0.838))
        arm = empty('Arm_' + side, (sign * 0.172, 0, 0.523), body)
        tube('Arm_' + side + '_Surface', [(sign * 0.18, 0, 0.515), (sign * 0.206, -0.008, 0.456), (sign * 0.226, -0.025, 0.365), (sign * 0.222, -0.035, 0.305)], [0.055, 0.058, 0.052, 0.037], 'Cream', arm, (sign * 0.172, 0, 0.523))
        vertices, faces = [], []
        profile = [(0, 0.055, 0.069, -0.020), (0.025, 0.074, 0.087, -0.026), (0.07, 0.072, 0.081, -0.022), (0.12, 0.054, 0.053, 0), (0.24, 0.056, 0.055, 0.012), (0.285, 0.040, 0.043, 0.012)]
        for z, rx, ry, y in profile:
            for i in range(16):
                angle = i * math.tau / 16
                vertices.append((sign * 0.086 + rx * math.cos(angle), y + ry * math.sin(angle), z))
        for j in range(len(profile) - 1):
            for i in range(16):
                nxt = (i + 1) % 16
                faces.append((j * 16 + i, j * 16 + nxt, (j + 1) * 16 + nxt, (j + 1) * 16 + i))
        faces.extend([tuple(reversed(range(16))), tuple((len(profile) - 1) * 16 + i for i in range(16))])
        mesh('Leg_' + side, vertices, faces, 'Cream', root, (sign * 0.086, 0, 0))

    muzzle = [ellipsoid('Muzzle_' + str(i), (x, -0.208, 0.753), (0.069, 0.043, 0.040), 'Cream', None, 20, 10) for i, x in enumerate([-0.043, 0.043])]
    join(muzzle, 'Muzzle', head)
    nose = mesh('Nose', [(-0.020, -0.258, 0.785), (0.020, -0.258, 0.785), (0, -0.266, 0.761), (-0.015, -0.247, 0.781), (0.015, -0.247, 0.781), (0, -0.249, 0.765)], [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], 'Pink', head)
    for sign in (-1, 1):
        line('Smile_' + str(sign), [(0, -0.254, 0.764), (sign * 0.010, -0.255, 0.742), (sign * 0.034, -0.249, 0.738), (sign * 0.052, -0.243, 0.747)], 0.003, 'Mouth', head)

    tail_points = [(0.02, 0.115, 0.275), (0.08, 0.205, 0.205), (0.20, 0.275, 0.163), (0.31, 0.315, 0.19), (0.365, 0.33, 0.28), (0.36, 0.32, 0.39), (0.305, 0.30, 0.475), (0.285, 0.29, 0.505)]
    tail = tube('Tail', tail_points, [0.05, 0.07, 0.085, 0.092, 0.09, 0.075, 0.045, 0.012], 'Orange', body, tail_points[0], 16)
    tail.data.materials.append(MATERIALS['Cream'])
    for polygon in tail.data.polygons:
        if polygon.center.z > 0.12:
            polygon.material_index = 1

    # Open-front cloak: one folded shoulder surface plus three rear leaf panels.
    vertices, faces = [], []
    count = 24
    for radius, z in [(0.73, 0.605), (1, 0.55), (1.12, 0.465)]:
        for i in range(count):
            a = -math.pi / 2 + 0.48 + i * (math.tau - 0.96) / (count - 1)
            vertices.append((0.22 * radius * math.cos(a), 0.145 * radius * math.sin(a), z - (0.025 if math.sin(a) > 0 else 0)))
    for ring in range(2):
        for i in range(count - 1):
            faces.append((ring * count + i, ring * count + i + 1, (ring + 1) * count + i + 1, (ring + 1) * count + i))
    cape = mesh('Leaf_Cape', vertices, faces, 'Cape', body)
    solidify = cape.modifiers.new('Cloth_Thickness', 'SOLIDIFY')
    solidify.thickness = 0.009
    bpy.context.view_layer.objects.active = cape
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    leaves = [cape]
    for i, x in enumerate([-0.12, 0, 0.12]):
        leaves.append(leaf('Cape_Rear_Leaf_' + str(i), (x, 0.18 if i == 1 else 0.155, 0.51), 0.15, 0.22, 'Cape_Light' if i == 1 else 'Cape', body, -x * 1.8))
    leaves.extend([leaf('Cape_Front_L', (-0.09, -0.146, 0.565), 0.14, 0.125, 'Cape_Light', body, -0.7), leaf('Cape_Front_R', (0.09, -0.146, 0.565), 0.14, 0.125, 'Cape_Light', body, 0.7)])
    join(leaves, 'Leaf_Cape', body)
    brooch = [disc('Wood_Brooch_Base', (0, -0.164, 0.558), 0.048, 0.018, 'Wood', body), disc('Wood_Brooch_Face', (0, -0.176, 0.558), 0.037, 0.006, 'Wood_Light', body), leaf('Brooch_Leaf', (0.003, -0.181, 0.583), 0.027, 0.046, 'Cape', body, -0.5)]
    join(brooch, 'Wood_Brooch', body)
    bag = [rounded_box('Bag_Body', (0.172, -0.123, 0.325), (0.15, 0.07, 0.15), 'Bag', body), rounded_box('Bag_Flap', (0.172, -0.165, 0.365), (0.145, 0.018, 0.06), 'Wood', body, 0.012), disc('Bag_Button', (0.182, -0.179, 0.353), 0.012, 0.007, 'Wood_Light', body)]
    join(bag, 'Satchel', body)
    line('Satchel_Strap', [(-0.135, -0.096, 0.572), (-0.08, -0.134, 0.486), (0.04, -0.143, 0.407), (0.145, -0.15, 0.353)], 0.011, 'Bag', body)
    bpy.context.view_layer.update()
    return root


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def statistics(objects):
    meshes = [o for o in objects if o.type == 'MESH']
    for obj in meshes:
        obj.data.calc_loop_triangles()
    corners = [obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box]
    return {'nodes': len(objects), 'meshes': len(meshes), 'triangles': sum(len(o.data.loop_triangles) for o in meshes), 'materials': len({m.name for o in meshes for m in o.data.materials}), 'bounds_z_up': {'min': [round(min(p[i] for p in corners), 6) for i in range(3)], 'max': [round(max(p[i] for p in corners), 6) for i in range(3)]}}


def main():
    global COLLECTION
    for folder in ['references', 'source', 'exports', 'renders']:
        (ROOT_DIR / folder).mkdir(exist_ok=True, parents=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.name = 'Companion_Cat_Preview'
    scene.unit_settings.system = 'METRIC'
    COLLECTION = bpy.data.collections.new('MODEL_CompanionCat')
    scene.collection.children.link(COLLECTION)
    palette = {'Cream': 'F5E7CF', 'Orange': 'E4B17D', 'Pink': 'DDA49B', 'Eye_White': 'FFF7E6', 'Eye_Green': '8B9B62', 'Pupil': '303927', 'Mouth': '88654D', 'Cape': '7E8B6C', 'Cape_Light': '9BA586', 'Wood': 'B48758', 'Wood_Light': 'D4AE7D', 'Bag': '936A49'}
    for name, value in palette.items():
        make_material(name, value, 0.42 if name.startswith('Eye') else 0.84)
    root = build()
    objects = list(COLLECTION.objects)
    expected = statistics(objects)
    assert abs(expected['bounds_z_up']['min'][2]) < 0.001
    assert 1.0 <= expected['bounds_z_up']['max'][2] <= 1.2
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb = ROOT_DIR / 'exports/companion_cat.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_texcoords=False, export_extras=True)
    print('CAT_STATS ' + json.dumps(expected), flush=True)

    # Re-import into an empty independent scene before generating previews.
    validation = bpy.data.scenes.new('Cat_Reimport_Check')
    bpy.context.window.scene = validation
    bpy.ops.import_scene.gltf(filepath=str(glb))
    bpy.context.view_layer.update()
    imported = statistics(list(validation.objects))
    assert imported['triangles'] == expected['triangles']
    assert imported['materials'] == expected['materials']
    assert not any(o.type in {'CAMERA', 'LIGHT', 'ARMATURE'} for o in validation.objects)
    for side in ['min', 'max']:
        assert max(abs(a-b) for a, b in zip(expected['bounds_z_up'][side], imported['bounds_z_up'][side])) < 0.002
    bpy.context.window.scene = scene
    # The validation scene is not included in the deliverable .blend.
    bpy.data.scenes.remove(validation)

    world = bpy.data.worlds.new('Cat_Studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (*color('F8F3E9'), 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.65
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.008))
    floor = bpy.context.object
    floor.name = 'Preview_Floor'
    floor.data.materials.append(make_material('Preview_Cream', 'F8F3E9'))
    for name, location, power, size in [('Key', (-3, -4, 5), 350, 3), ('Fill', (3, -2, 3), 150, 3), ('Rim', (0, 3, 4), 240, 2.5)]:
        data = bpy.data.lights.new('Preview_' + name, 'AREA')
        data.energy, data.size = power, size
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = location
        aim(light, (0, 0, 0.55))
    camera_data = bpy.data.cameras.new('Preview_Camera')
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 1.53
    camera = bpy.data.objects.new('Preview_Camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x = scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    views = {'front': (0, -4, 0.83), 'side': (4, 0, 0.83), 'back': (0, 4, 0.83), 'isometric': (2.7, -4, 2.0)}
    for name, position in views.items():
        camera.location = position
        aim(camera, (0, 0, 0.59))
        scene.render.filepath = str(ROOT_DIR / ('renders/' + name + '.png'))
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT_DIR / 'source/companion_cat.blend'))
    report = {'blender': bpy.app.version_string, 'source': expected, 'reimport': imported, 'glb_bytes': glb.stat().st_size, 'status': 'PASS', 'animation': 'R3F: named parent pivots; no rig or baked clips', 'front_gltf': '+Z'}
    (ROOT_DIR / 'exports/validation_report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    for path in [ROOT_DIR / 'source/companion_cat.blend', glb] + [ROOT_DIR / ('renders/' + name + '.png') for name in views]:
        assert path.is_file() and path.stat().st_size > 0
    print('CAT_DELIVERY_PASS ' + json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
