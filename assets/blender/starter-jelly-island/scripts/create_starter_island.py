"""Build, render, export and independently re-import Starter Jelly Island.

Run with Blender, not a system Python interpreter. No external packages required.
Blender authoring coordinates: metres, Z up. glTF export: standard Y up.
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import random
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


SEED = 2401
RNG = random.Random(SEED)
N = 48
OUTLINE: list[tuple[float, float]] = []
ASSET_ROOT = Path(__file__).resolve().parents[1]
MODEL_COLLECTION: bpy.types.Collection
ROOT: bpy.types.Object
MATERIALS: dict[str, bpy.types.Material] = {}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-root", type=Path, default=ASSET_ROOT)
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--skip-render", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def srgb(hex_color: str):
    values = [int(hex_color.lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values)


def material(name, hex_color, roughness=0.85):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    rgba = (*srgb(hex_color), 1.0)
    mat.diffuse_color = rgba
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0
    # Soft toy-like surfaces without transparency or special glTF extensions.
    shader.inputs["Specular IOR Level"].default_value = 0.50
    MATERIALS[name] = mat
    return mat


def move_to_collection(obj, collection):
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    MODEL_COLLECTION.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.3
    obj.parent = parent
    return obj


def mesh_object(name, vertices, faces, mats, parent=None, smooth=False, indices=None):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    MODEL_COLLECTION.objects.link(obj)
    obj.parent = parent or ROOT
    for mat in mats:
        mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
        if indices:
            polygon.material_index = indices[polygon.index]
    return obj


def outline_points():
    """Resample a soft squircle by arc length, avoiding long narrow corner faces."""
    dense = []
    for i in range(2049):
        t = 2 * math.pi * i / 2048
        c, s = math.cos(t), math.sin(t)
        wobble = 1 + 0.006 * math.sin(3 * t + 0.7) + 0.004 * math.cos(5 * t)
        dense.append(
            (
                4.5 * math.copysign(abs(c) ** 0.48, c) * wobble,
                4.3 * math.copysign(abs(s) ** 0.48, s) * wobble,
            )
        )
    distances = [0.0]
    for p, q in zip(dense, dense[1:]):
        distances.append(distances[-1] + math.dist(p, q))
    result = []
    for i in range(N):
        distance = i * distances[-1] / N
        j = max(1, bisect.bisect_left(distances, distance))
        alpha = (distance - distances[j - 1]) / (distances[j] - distances[j - 1])
        result.append(tuple(a + alpha * (b - a) for a, b in zip(dense[j - 1], dense[j])))
    return result


def edge_wave(index):
    t = 2 * math.pi * index / N
    return 0.027 * math.sin(3 * t + 0.4) + 0.013 * math.sin(7 * t)


def top_height(x, y):
    return (
        0.655
        + 0.075 * math.exp(-((x + 2) ** 2 + (y - 1.3) ** 2) / 5)
        + 0.014 * math.sin(x * 0.8 + y * 0.5)
    )


def band(name, profile, mats, cap_bottom=True, cap_top=True, grass=False):
    vertices, faces, indices = [], [], []
    for ring_index, (scale, z) in enumerate(profile):
        for i, (x, y) in enumerate(OUTLINE):
            px, py = x * scale, y * scale
            pz = z + edge_wave(i)
            if grass and ring_index >= 4:
                pz = top_height(px, py) - (0.025 if ring_index == 4 else 0)
            vertices.append((px, py, pz))
    for ring in range(len(profile) - 1):
        for i in range(N):
            nxt = (i + 1) % N
            a, b = ring * N + i, ring * N + nxt
            c, d = (ring + 1) * N + nxt, (ring + 1) * N + i
            if grass and ring >= 3:
                faces.extend([(a, b, c), (a, c, d)])
                # Close hues, low contrast: enough variation to read as low poly.
                indices.extend([RNG.choices([0, 1, 2], [8, 1, 1])[0]] * 2)
            else:
                faces.append((a, b, c, d))
                indices.append(3 if grass else 0)
    if cap_bottom:
        faces.append(tuple(reversed(range(N))))
        indices.append(3 if grass else 0)
    if cap_top:
        if grass:
            center = len(vertices)
            vertices.append((0, 0, top_height(0, 0)))
            start = (len(profile) - 1) * N
            for i in range(N):
                faces.append((start + i, start + (i + 1) % N, center))
                indices.append(0)
        else:
            faces.append(tuple((len(profile) - 1) * N + i for i in range(N)))
            indices.append(0)
    return mesh_object(name, vertices, faces, mats, smooth=True, indices=indices)


def apply_scale(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def ico(name, location, scale, mat, parent, subdivisions=2, smooth=False):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name}_Mesh"
    move_to_collection(obj, MODEL_COLLECTION)
    obj.scale = scale
    obj.parent = parent
    apply_scale(obj)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def branch(name, start, end, radius, mat, parent, tip=0.65, sides=8):
    start, end = Vector(start), Vector(end)
    delta = end - start
    bpy.ops.mesh.primitive_cone_add(
        vertices=sides,
        radius1=radius,
        radius2=radius * tip,
        depth=delta.length,
        location=(start + end) / 2,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    obj.parent = parent
    move_to_collection(obj, MODEL_COLLECTION)
    obj.data.materials.append(mat)
    return obj


def join_related(objects, name, parent):
    """Batch only small parts of a single decoration; preserve scene hierarchy."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name}_Mesh"
    obj.parent = parent
    return obj


def tree(name, x, y, scale):
    group = empty(name, ROOT)
    z = top_height(x, y)

    def p(dx, dy, dz):
        return (x + dx * scale, y + dy * scale, z + dz * scale)

    trunks = [
        branch(f"{name}_Trunk", p(0, 0, -0.06), p(0.06, 0.02, 1.75), 0.14 * scale, MATERIALS["Wood"], group),
        branch(f"{name}_Branch_A", p(0.03, 0, 0.85), p(-0.40, 0, 1.70), 0.085 * scale, MATERIALS["Wood"], group),
        branch(f"{name}_Branch_B", p(0.03, 0, 1.10), p(0.46, 0.08, 1.91), 0.075 * scale, MATERIALS["Wood"], group),
    ]
    join_related(trunks, f"{name}_Trunk", group)
    for i, (offset, dims, color) in enumerate(
        [
            ((0.0, 0.06, 2.08), (0.82, 0.76, 0.91), "Leaves_Main"),
            ((-0.50, -0.03, 1.85), (0.58, 0.57, 0.64), "Leaves_Shade"),
            ((0.48, 0.04, 2.12), (0.58, 0.60, 0.68), "Leaves_Light"),
        ],
        1,
    ):
        obj = ico(f"{name}_Canopy_{i:02d}", p(*offset), tuple(d * scale for d in dims), MATERIALS[color], group)
        obj.rotation_euler = (0.08 * i, -0.09 * i, 0.5 * i)
    # Independent tree pivots sit at their feet; only the island root is at zero.
    foot = Vector((x, y, z))
    for child in group.children:
        child.location -= foot
    group.location = foot
    return group


def grass_clump(name, x, y, scale, rotation, parent):
    vertices, faces = [], []
    for angle, height, width in [(-0.62, 0.29, 0.12), (0, 0.39, 0.13), (0.65, 0.30, 0.11)]:
        tilt = angle * 0.45
        start = len(vertices)
        blade = [
            (-width / 2, 0, 0),
            (width / 2, 0, 0),
            (tilt + width / 3, 0.02, height * 0.60),
            (tilt, 0.07, height),
            (tilt - width / 3, 0.02, height * 0.60),
            (tilt, -0.035, height * 0.52),
        ]
        for px, py, pz in blade:
            a = rotation + angle * 0.6
            vertices.append(
                (
                    x + scale * (px * math.cos(a) - py * math.sin(a)),
                    y + scale * (px * math.sin(a) + py * math.cos(a)),
                    top_height(x, y) - 0.04 + pz * scale,
                )
            )
        faces.extend(tuple(start + j for j in face) for face in [(0, 1, 5), (1, 2, 5), (2, 3, 5), (3, 4, 5), (4, 0, 5), (0, 4, 3, 2, 1)])
    return mesh_object(name, vertices, faces, [MATERIALS["Grass_Decor"]], parent=parent)


def flower(name, x, y, height, parent):
    z = top_height(x, y)
    parts = [branch(f"{name}_Stem", (x, y, z - 0.025), (x, y, z + height), 0.022, MATERIALS["Grass_Decor"], parent, sides=6)]
    for i in range(5):
        a = i * 2 * math.pi / 5
        petal = ico(
            f"{name}_Petal_{i}",
            (x + 0.11 * math.cos(a), y + 0.11 * math.sin(a), z + height),
            (0.12, 0.077, 0.035),
            MATERIALS["Petals"],
            parent,
            subdivisions=1,
            smooth=True,
        )
        petal.rotation_euler.z = a
        parts.append(petal)
    parts.append(ico(f"{name}_Center", (x, y, z + height + 0.028), (0.064, 0.064, 0.044), MATERIALS["Pollen"], parent, subdivisions=1))
    return join_related(parts, name, parent)


def build_model():
    global MODEL_COLLECTION, ROOT, OUTLINE
    MODEL_COLLECTION = bpy.data.collections.new("MODEL_Starter_Jelly_Island")
    bpy.context.scene.collection.children.link(MODEL_COLLECTION)
    ROOT = empty("Starter_Jelly_Island")
    ROOT["asset_version"] = "1.0"
    ROOT["units"] = "metres"
    ROOT["authoring_up_axis"] = "Z"
    ROOT["animation_hint"] = "Animate this root with subtle translation and uniform scale; no rig required."
    OUTLINE = outline_points()

    for name, color, roughness in [
        ("Grass_Main", "90BC69", 0.86),
        ("Grass_Warm", "94BF6E", 0.87),
        ("Grass_Soft", "8CB765", 0.88),
        ("Grass_Edge", "73A255", 0.82),
        ("Soil_Light", "C38B62", 0.92),
        ("Soil_Dark", "95614B", 0.94),
        ("Soil_Base", "78513F", 0.93),
        ("Wood", "997052", 0.91),
        ("Leaves_Main", "78AD60", 0.90),
        ("Leaves_Shade", "699A57", 0.91),
        ("Leaves_Light", "90BC69", 0.90),
        ("Grass_Decor", "5F8E49", 0.90),
        ("Rock", "C5CBC1", 0.94),
        ("Petals", "FFF6DA", 0.80),
        ("Pollen", "EBC56C", 0.85),
    ]:
        material(name, color, roughness)

    band("Island_Base", [(0.68, -0.725), (0.83, -0.695), (0.91, -0.585), (0.95, -0.43)], [MATERIALS["Soil_Base"]])
    band("Soil_Layer_Dark", [(0.95, -0.43), (0.974, -0.29), (0.988, -0.09)], [MATERIALS["Soil_Dark"]])
    band("Soil_Layer_Light", [(0.988, -0.09), (0.995, 0.08), (0.980, 0.255)], [MATERIALS["Soil_Light"]])
    band(
        "Grass_Top",
        [(0.980, 0.255), (1.006, 0.365), (1.010, 0.49), (0.977, 0.60), (0.88, 0.66), (0.62, 0.68), (0.31, 0.68)],
        [MATERIALS[n] for n in ("Grass_Main", "Grass_Warm", "Grass_Soft", "Grass_Edge")],
        grass=True,
    )

    tree("Tree_01", -2.60, 1.25, 0.91)
    tree("Tree_02", -0.65, 2.70, 0.67)

    rocks = empty("Rocks", ROOT)
    for i, (x, y, dims) in enumerate(
        [(-3.05, -2.35, (0.36, 0.27, 0.22)), (-2.55, -2.57, (0.21, 0.18, 0.14)), (3.20, 1.85, (0.32, 0.24, 0.19)), (3.53, 1.62, (0.16, 0.14, 0.11))],
        1,
    ):
        obj = ico(f"Rock_{i:02d}", (x, y, top_height(x, y) + dims[2] * 0.45), dims, MATERIALS["Rock"], rocks, subdivisions=1)
        obj.rotation_euler = (0.12, -0.18, i * 0.83)

    clumps = empty("Grass_Clumps", ROOT)
    for i, (x, y, scale) in enumerate(
        [(-3.2, -1.2, 0.90), (-2.15, 2.95, 0.83), (1.65, 3.25, 0.80), (3.45, -0.6, 0.85), (2.9, -2.95, 0.82), (-1.85, -3.10, 0.78)],
        1,
    ):
        grass_clump(f"Grass_Clump_{i:02d}", x, y, scale, i * 1.3, clumps)

    flowers = empty("Flowers", ROOT)
    for i, (x, y, height) in enumerate([(-2.95, -1.50, 0.25), (-2.62, -1.66, 0.31), (2.68, -2.77, 0.24)], 1):
        flower(f"Flower_{i:02d}", x, y, height, flowers)

    # An invisible named anchor, not a building or visible placement marker.
    placement = empty("Future_Placement", ROOT)
    placement.location = (1.1, -0.60, top_height(1.1, -0.60))
    placement["clear_width_m"] = 3.6
    placement["clear_depth_m"] = 3.5
    placement["purpose"] = "Reserved open area for future objects; no building in this asset."


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_preview(scene, samples):
    stage = bpy.data.collections.new(f"PREVIEW_ONLY_{scene.name}")
    scene.collection.children.link(stage)

    camera_data = bpy.data.cameras.new(f"Preview_Camera_{scene.name}")
    camera = bpy.data.objects.new(f"Preview_Camera_{scene.name}", camera_data)
    stage.objects.link(camera)
    camera.location = (12.5, -16.0, 10.5)
    aim(camera, (0, 0, 0.70))
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 14.6
    camera_data.lens = 50
    camera_data.clip_end = 250
    scene.camera = camera

    floor_material = material(f"Preview_Cream_{scene.name}", "F6F1E7", 1.0)
    floor_shader = floor_material.node_tree.nodes.get("Principled BSDF")
    floor_shader.inputs["Emission Color"].default_value = (*srgb("F6F1E7"), 1.0)
    floor_shader.inputs["Emission Strength"].default_value = 0.35
    floor_mesh = bpy.data.meshes.new(f"Preview_Floor_{scene.name}")
    floor_mesh.from_pydata([(-100, -100, -1.52), (100, -100, -1.52), (100, 100, -1.52), (-100, 100, -1.52)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new(f"Preview_Floor_{scene.name}", floor_mesh)
    stage.objects.link(floor)
    floor.data.materials.append(floor_material)

    for name, position, energy, size, color in [
        ("Key", (-5, -7, 12), 2200, 7.5, (1.0, 0.92, 0.80)),
        ("Fill", (7, -2, 9), 1250, 8.0, (0.88, 0.95, 1.0)),
        ("Rim", (1, 7, 11), 1900, 6.0, (1.0, 0.97, 0.88)),
    ]:
        light_data = bpy.data.lights.new(f"Preview_{name}_{scene.name}", "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light_data.color = color
        light = bpy.data.objects.new(light_data.name, light_data)
        stage.objects.link(light)
        light.location = position
        aim(light, (0, 0, 0))

    world = bpy.data.worlds.new(f"Preview_World_{scene.name}")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("F6F1E7"), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 5
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 2
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.3
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return stage


def statistics(objects):
    meshes = [o for o in objects if o.type == "MESH"]
    materials = {m.name for obj in meshes for m in obj.data.materials if m}
    for obj in meshes:
        obj.data.calc_loop_triangles()
    corners = [obj.matrix_world @ Vector(v) for obj in meshes for v in obj.bound_box]
    bounds = {
        "min": [round(min(p[i] for p in corners), 5) for i in range(3)],
        "max": [round(max(p[i] for p in corners), 5) for i in range(3)],
    }
    return {
        "objects": len(objects),
        "mesh_objects": len(meshes),
        "empty_objects": sum(o.type == "EMPTY" for o in objects),
        "vertices": sum(len(o.data.vertices) for o in meshes),
        "polygons": sum(len(o.data.polygons) for o in meshes),
        "triangles": sum(len(o.data.loop_triangles) for o in meshes),
        "materials": len(materials),
        "bounds_blender_z_up_m": bounds,
    }


def glb_document(path):
    payload = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", payload)
    assert magic == b"glTF" and version == 2 and length == len(payload)
    chunk_length, chunk_type = struct.unpack_from("<II", payload, 12)
    assert chunk_type == 0x4E4F534A
    return json.loads(payload[20 : 20 + chunk_length])


def check_glb(path, expected):
    doc = glb_document(path)
    assert not doc.get("cameras"), "Preview camera leaked into GLB"
    assert not doc.get("animations"), "Unexpected animation"
    assert not doc.get("skins"), "Unexpected armature"
    assert not doc.get("images") and not doc.get("textures"), "Unexpected image dependency"
    assert not doc.get("extensionsUsed"), "This asset should use core glTF PBR only"
    assert all("uri" not in buffer for buffer in doc["buffers"])
    names = {n.get("name") for n in doc["nodes"]}
    assert {"Starter_Jelly_Island", "Island_Base", "Grass_Top", "Soil_Layer_Light", "Soil_Layer_Dark", "Tree_01", "Tree_02", "Future_Placement"} <= names
    assert not any(name and name.startswith("Preview_") for name in names)
    primitives = [p for mesh in doc["meshes"] for p in mesh["primitives"]]
    triangles = sum(doc["accessors"][p["indices"]]["count"] // 3 for p in primitives)
    assert triangles == expected["triangles"], (triangles, expected["triangles"])
    return {
        "bytes": path.stat().st_size,
        "nodes": len(doc["nodes"]),
        "meshes": len(doc["meshes"]),
        "primitives_potential_draw_calls": len(primitives),
        "triangles": triangles,
        "materials": len(doc["materials"]),
        "textures": len(doc.get("textures", [])),
        "cameras": len(doc.get("cameras", [])),
        "animations": len(doc.get("animations", [])),
        "extensions_used": doc.get("extensionsUsed", []),
        "standard_up_axis": "Y",
    }


def validate_import(glb, expected, render_path, samples, render):
    """Use a new scene with no linked model objects from the authoring scene."""
    validation = bpy.data.scenes.new("GLB_Independent_Reimport_Validation")
    bpy.context.window.scene = validation
    assert len(validation.objects) == 0
    bpy.ops.import_scene.gltf(filepath=str(glb))
    bpy.context.view_layer.update()
    imported = list(validation.objects)
    actual = statistics(imported)
    assert actual["mesh_objects"] == expected["mesh_objects"]
    assert actual["triangles"] == expected["triangles"]
    assert actual["materials"] == expected["materials"]
    assert not any(obj.type in {"CAMERA", "LIGHT", "ARMATURE"} for obj in imported)
    assert not any(obj.animation_data for obj in imported)
    for obj in imported:
        if obj.type == "MESH":
            assert len(obj.data.vertices) > 0
            assert len(obj.data.materials) > 0
            for mat in obj.data.materials:
                assert mat.use_nodes
                assert any(n.type == "BSDF_PRINCIPLED" for n in mat.node_tree.nodes)
                assert not any(n.type == "TEX_IMAGE" for n in mat.node_tree.nodes)
    for side in ("min", "max"):
        for source, dest in zip(expected["bounds_blender_z_up_m"][side], actual["bounds_blender_z_up_m"][side]):
            assert abs(source - dest) < 0.002, (side, source, dest)
    root = next(o for o in imported if o.name.startswith("Starter_Jelly_Island"))
    assert root.location.length < 0.0001
    actual["status"] = "PASS"
    actual["material_nodes"] = "Principled BSDF; no image nodes"
    actual["no_preview_camera_lights_or_animation"] = True
    if render:
        setup_preview(validation, samples)
        validation.render.filepath = str(render_path)
        bpy.ops.render.render(write_still=True)
    return actual


def main():
    args = parse_args()
    asset_root = args.asset_root.resolve()
    for folder in ("references", "scripts", "source", "exports", "renders"):
        (asset_root / folder).mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    source_scene = bpy.context.scene
    source_scene.name = "Starter_Jelly_Island_Preview"
    source_scene.unit_settings.system = "METRIC"
    source_scene.unit_settings.scale_length = 1.0
    build_model()
    bpy.context.view_layer.update()
    model_objects = list(MODEL_COLLECTION.objects)
    expected = statistics(model_objects)
    base_objects = [o for o in model_objects if o.name in {"Island_Base", "Soil_Layer_Dark", "Soil_Layer_Light", "Grass_Top"}]
    expected["ground_dimensions_m"] = statistics(base_objects)["bounds_blender_z_up_m"]

    blend_path = asset_root / "source/starter_jelly_island.blend"
    glb_path = asset_root / "exports/starter_jelly_island.glb"
    png_path = asset_root / "renders/starter_jelly_island.png"
    reimport_png = asset_root / "renders/starter_jelly_island_reimport.png"
    setup_preview(source_scene, args.samples)
    source_scene.render.filepath = str(png_path)

    # Leave a useful camera view when the authoring .blend is opened interactively.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in model_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = ROOT
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_extras=True,
        export_draco_mesh_compression_enable=False,
    )
    export_stats = check_glb(glb_path, expected)
    print("MODEL_STATS " + json.dumps(expected), flush=True)
    print("GLB_STATS " + json.dumps(export_stats), flush=True)
    if not args.skip_render:
        bpy.ops.render.render(write_still=True)

    import_stats = validate_import(glb_path, expected, reimport_png, args.samples, not args.skip_render)
    manifest = {
        "asset": "Starter Jelly Island",
        "version": "1.0",
        "blender_version": bpy.app.version_string,
        "seed": SEED,
        "source": expected,
        "glb": export_stats,
        "independent_reimport": import_stats,
        "reserved_space_m": {"width": 3.6, "depth": 3.5, "center_blender_z_up": [1.1, -0.6, round(top_height(1.1, -0.6), 5)]},
        "render": {"width": 1600, "height": 1600, "engine": "Cycles CPU", "samples": args.samples, "orthographic": True},
    }
    outputs = [blend_path, glb_path]
    if not args.skip_render:
        outputs.extend([png_path, reimport_png])
    for path in outputs:
        assert path.is_file() and path.stat().st_size > 0, path
        if path.suffix == ".png":
            with path.open("rb") as image:
                header = image.read(24)
            assert struct.unpack(">II", header[16:24]) == (1600, 1600)
    (asset_root / "exports/validation_report.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("REIMPORT_VALIDATION " + json.dumps(import_stats), flush=True)
    print("DELIVERY_COMPLETE " + str(asset_root), flush=True)


if __name__ == "__main__":
    main()
