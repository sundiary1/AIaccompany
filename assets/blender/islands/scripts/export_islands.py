"""Run with Blender --background --factory-startup --disable-autoexec --python.

Export editable source copies without saving over them. Freeze evaluated geometry
at frame 1; omit presentation objects. Web materials avoid real-time transmission.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[4]
ASSETS = ROOT / "assets/blender/islands"
PUBLIC = ROOT / "frontend/public/models/islands"
JOBS = {
    "home": ("plane_crash_island.blend", "home-island.glb", "ground"),
    "sandplay": ("sandplay_island.blend", "sandplay-island.glb", "Grass"),
}


def bounds(objects):
    points = [
        o.matrix_world @ v.co
        for o in objects
        if o.type == "MESH"
        for v in o.data.vertices
    ]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    return {
        "min": low,
        "max": high,
        "size": [b - a for a, b in zip(low, high, strict=True)],
    }


def triangles(objects):
    total = 0
    for obj in objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            total += len(obj.data.loop_triangles)
    return total


def compatible_materials(objects):
    fixes = []
    materials = {m for o in objects for m in o.data.materials if m}
    for material in materials:
        if not material.use_nodes:
            continue
        tree = material.node_tree
        for node in list(tree.nodes):
            if (
                node.type == "BSDF_PRINCIPLED"
                and node.inputs["Transmission Weight"].default_value > 0
            ):
                fixes.append(
                    {
                        "material": material.name,
                        "change": "opaque stylized water; preserve base color/roughness",
                    }
                )
                node.inputs["Transmission Weight"].default_value = 0
            if node.type == "EMISSION":
                color = tuple(node.inputs["Color"].default_value)
                strength = node.inputs["Strength"].default_value
                output = next(n for n in tree.nodes if n.type == "OUTPUT_MATERIAL")
                shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
                shader.inputs["Base Color"].default_value = color
                shader.inputs["Emission Color"].default_value = color
                shader.inputs["Emission Strength"].default_value = strength
                tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
                tree.nodes.remove(node)
                fixes.append(
                    {
                        "material": material.name,
                        "change": "emission converted to exportable Principled",
                    }
                )
    return fixes


def preview(scene, objects, path):
    b = bounds(objects)
    target = Vector((0, 0, (b["min"][2] + b["max"][2]) / 2))
    camera_data = bpy.data.cameras.new("Export_Preview_Camera")
    camera = bpy.data.objects.new("Export_Preview_Camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (12.5, -16, 12)
    camera.rotation_euler = (
        (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 12
    scene.camera = camera
    world = bpy.data.worlds.new("White_Preview_World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.65
    scene.world = world
    for name, pos, energy, size in [
        ("Key", (-5, -8, 12), 1300, 8),
        ("Fill", (7, 3, 9), 850, 7),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = pos
        light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for key, (filename, output, terrain_name) in JOBS.items():
        directory = ASSETS / key
        bpy.ops.wm.open_mainfile(
            filepath=str(directory / "source" / filename),
            load_ui=False,
            use_scripts=False,
        )
        source_scene = bpy.context.scene
        source_scene.frame_set(1)
        graph = bpy.context.evaluated_depsgraph_get()
        selected = [
            o
            for o in source_scene.objects
            if o.type == "MESH"
            and o.visible_get()
            and not o.hide_render
            and o.name.lower() != "bg"
        ]
        excluded = [
            {"name": o.name, "type": o.type}
            for o in source_scene.objects
            if o not in selected
        ]
        # Snapshot evaluated meshes before switching scenes; no physics or rig export.
        copies = []
        for original in selected:
            mesh = bpy.data.meshes.new_from_object(
                original.evaluated_get(graph), depsgraph=graph
            )
            duplicate = bpy.data.objects.new(original.name + "_Web", mesh)
            duplicate.matrix_world = original.matrix_world.copy()
            copies.append((original.name, duplicate))
        scene = bpy.data.scenes.new("Web_Export")
        bpy.context.window.scene = scene
        scene.unit_settings.system = "METRIC"
        root = bpy.data.objects.new(
            "Home_Island" if key == "home" else "Sandplay_Island", None
        )
        scene.collection.objects.link(root)
        for name, obj in copies:
            scene.collection.objects.link(obj)
            obj.parent = root
            obj["source_name"] = name
        objects = [o for _, o in copies]
        before = triangles(objects)
        optimizations = []
        for name, obj in copies:
            if (
                key == "home"
                and name.startswith("Vert")
                and len(obj.data.polygons) > 1000
            ):
                bpy.context.view_layer.objects.active = obj
                decimate = obj.modifiers.new("Web_Grass_LOD", "DECIMATE")
                decimate.ratio = 0.35
                decimate.use_collapse_triangulate = True
                bpy.ops.object.modifier_apply(modifier=decimate.name)
                optimizations.append(name)
        bpy.context.view_layer.update()
        fixes = compatible_materials(objects)
        terrain = next(obj for name, obj in copies if name == terrain_name)
        # Actual mesh ray heights inform cat placement, docks and future navigation.
        surfaces = []
        inverse = terrain.matrix_world.inverted()
        for x in [-3.6, -3, -2, -1, 0, 1, 2, 3, 3.6]:
            for y in [-3.6, -3, -2, -1, 0, 1, 2, 3, 3.6]:
                origin = inverse @ Vector((x, y, 15))
                direction = (inverse.to_3x3() @ Vector((0, 0, -1))).normalized()
                hit, point, _normal, _face = terrain.ray_cast(origin, direction)
                if hit:
                    position = terrain.matrix_world @ point
                    surfaces.append([x, y, position.z])
        materials = {m for o in objects for m in o.data.materials if m}
        expected = bounds(objects)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in [root, *objects]:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        bpy.ops.export_scene.gltf(
            filepath=str(PUBLIC / output),
            export_format="GLB",
            use_selection=True,
            use_active_scene=True,
            export_yup=True,
            export_apply=True,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            export_skins=False,
            export_morph=False,
            export_extras=True,
            export_materials="EXPORT",
            export_image_format="AUTO",
        )
        (directory / "renders").mkdir(exist_ok=True)
        preview(scene, objects, directory / "renders" / "isometric.png")
        # Import into a genuinely independent scene; exporter geometry must survive.
        validation = bpy.data.scenes.new("GLB_Reimport_Check")
        bpy.context.window.scene = validation
        bpy.ops.import_scene.gltf(filepath=str(PUBLIC / output))
        imported = list(validation.objects)
        actual = bounds(imported)
        assert triangles(imported) == triangles(objects), (
            triangles(imported),
            triangles(objects),
        )
        assert not any(o.type in {"LIGHT", "CAMERA", "ARMATURE"} for o in imported)
        for a, b in zip(expected["size"], actual["size"], strict=True):
            assert math.isclose(a, b, abs_tol=0.003), (a, b)
        report = {
            "blender": bpy.app.version_string,
            "source": filename,
            "excluded": excluded,
            "source_meshes": len(objects),
            "triangles_before": before,
            "triangles": triangles(objects),
            "materials": len(materials),
            "grass_lod_objects": optimizations,
            "material_adjustments": fixes,
            "bounds_blender_z_up": expected,
            "bounds_gltf_y_up": {
                "min": [expected["min"][0], expected["min"][2], -expected["max"][1]],
                "max": [expected["max"][0], expected["max"][2], -expected["min"][1]],
            },
            "terrain_source_name": terrain_name,
            "surface_samples_blender": surfaces,
            "glb": str((PUBLIC / output).relative_to(ROOT)),
            "bytes": (PUBLIC / output).stat().st_size,
            "reimport": {
                "status": "PASS",
                "triangles": triangles(imported),
                "bounds": actual,
            },
        }
        (directory / "export-report.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
        sys.stdout.write(f"EXPORT_OK {key} {report['triangles']} {report['bytes']}\n")


if __name__ == "__main__":
    main()
