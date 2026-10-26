"""Blender --background --factory-startup --disable-autoexec --python <file>.

Freeze visible geometry only. Source files are read-only inputs; modifiers and
material conversions affect this in-memory export session, never the .blend.
"""

import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[5]
DIRECTORY = ROOT / "assets/blender/islands/mindfulness"
PUBLIC = ROOT / "frontend/public/models/mindfulness"
spec = importlib.util.spec_from_file_location(
    "island_export", ROOT / "assets/blender/islands/scripts/export_islands.py"
)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
PUBLIC.mkdir(parents=True, exist_ok=True)


def kind(obj):
    names = " ".join(m.name.lower() for m in obj.data.materials if m)
    if "water" in names:
        return "water"
    if obj.name == "Plane.359":
        return "foliage"
    if obj.name == "Cylinder.089":
        return "trunk"
    if "stone" in names or "rock" in names:
        return "rock"
    return "terrain"


reports = {}
for key in ("beach_home", "rainforest"):
    bpy.ops.wm.open_mainfile(
        filepath=str(DIRECTORY / "source" / f"{key}.blend"),
        load_ui=False,
        use_scripts=False,
    )
    source_scene = bpy.context.scene
    source_scene.frame_set(1)
    fallback = bpy.data.materials.new("Missing_Slot_Cream")
    fallback.use_nodes = True
    fallback.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.8,
        0.78,
        0.71,
        1,
    )
    fallback.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    originals = [
        o
        for o in source_scene.objects
        if o.type in {"MESH", "CURVE"}
        and o.visible_get()
        and not o.hide_render
        and o.name.lower() != "bg"
    ]
    adjustments = []
    for obj in originals:
        for modifier in obj.modifiers:
            if modifier.type == "SUBSURF" and modifier.levels > 1:
                modifier.levels = 1
                adjustments.append({"object": obj.name, "subdivision_levels": 1})
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    copies = []
    excluded = [o.name for o in source_scene.objects if o not in originals]
    for original in originals:
        mesh = bpy.data.meshes.new_from_object(
            original.evaluated_get(graph), depsgraph=graph
        )
        if not mesh.polygons:
            excluded.append(original.name)
            continue
        if not mesh.materials:
            mesh.materials.append(fallback)
        for index, material in enumerate(mesh.materials):
            if material is None:
                mesh.materials[index] = fallback
        mesh.transform(original.matrix_world)
        obj = bpy.data.objects.new(original.name + "_Web", mesh)
        obj["source_name"] = original.name
        obj["jelly_kind"] = kind(original)
        copies.append(obj)
    scene = bpy.data.scenes.new("Mindfulness_Web_Export")
    bpy.context.window.scene = scene
    scene.unit_settings.system = "METRIC"
    for obj in copies:
        scene.collection.objects.link(obj)
        if key == "rainforest":
            obj.data.calc_loop_triangles()
            count = len(obj.data.loop_triangles)
            budget = (
                28000
                if obj["jelly_kind"] == "foliage"
                else 20000
                if obj["jelly_kind"] == "trunk"
                else 6000
            )
            if count > budget:
                bpy.context.view_layer.objects.active = obj
                modifier = obj.modifiers.new("Web_Detail_Budget", "DECIMATE")
                modifier.ratio = budget / count
                bpy.ops.object.modifier_apply(modifier=modifier.name)
                adjustments.append({"object": obj.name, "triangle_budget": budget})
    bpy.context.view_layer.update()
    original_bounds = helpers.bounds(copies)
    center = Vector(
        [
            (original_bounds["min"][0] + original_bounds["max"][0]) / 2,
            (original_bounds["min"][1] + original_bounds["max"][1]) / 2,
            original_bounds["min"][2] + 1,
        ]
    )
    factor = 8 / max(original_bounds["size"][:2])
    fixes = helpers.compatible_materials(copies)
    for obj in copies:
        # Geometry stays rigid; foliage gets a sensible bottom pivot for sway.
        for v in obj.data.vertices:
            v.co = (v.co - center) * factor
        low = Vector([min(v.co[i] for v in obj.data.vertices) for i in range(3)])
        high = Vector([max(v.co[i] for v in obj.data.vertices) for i in range(3)])
        pivot = (low + high) / 2
        pivot.z = low.z
        obj.data.transform(Matrix.Translation(-pivot))
        obj.location = pivot
        for material in obj.data.materials:
            if not material or not material.use_nodes:
                continue
            for node in material.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    socket = node.inputs["Base Color"]
                    if socket.is_linked:
                        # Only tree bark is procedural; choose its authored ramp
                        # midpoint as a flat matte glTF color (no external map).
                        ramps = [
                            n for n in material.node_tree.nodes if n.type == "VALTORGB"
                        ]
                        if ramps:
                            color = ramps[0].color_ramp.evaluate(0.5)
                            for link in list(socket.links):
                                material.node_tree.links.remove(link)
                            socket.default_value = color
                            fixes.append(
                                {
                                    "material": material.name,
                                    "change": "bark ramp midpoint as flat color",
                                }
                            )
    root = bpy.data.objects.new("Mindfulness_" + key, None)
    scene.collection.objects.link(root)
    for obj in copies:
        obj.parent = root
    bpy.context.view_layer.update()
    expected = helpers.bounds(copies)
    triangles = helpers.triangles(copies)
    output = PUBLIC / ("beach-island.glb" if key == "beach_home" else "rainforest.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *copies]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )
    (DIRECTORY / "renders").mkdir(exist_ok=True)
    preview = DIRECTORY / "renders" / f"{key}.png"
    helpers.preview(scene, copies, preview)
    if key == "rainforest":
        (PUBLIC / "rainforest-preview.png").write_bytes(preview.read_bytes())
    validation = bpy.data.scenes.new("Mindfulness_Reimport")
    bpy.context.window.scene = validation
    bpy.ops.import_scene.gltf(filepath=str(output))
    imported = list(validation.objects)
    assert helpers.triangles(imported) == triangles
    actual = helpers.bounds(imported)
    assert all(
        abs(a - b) < 0.003
        for axis in ("min", "max")
        for a, b in zip(expected[axis], actual[axis], strict=True)
    )
    assert not any(o.type in {"CAMERA", "LIGHT"} for o in imported)
    reports[key] = {
        "blender": bpy.app.version_string,
        "source": f"source/{key}.blend",
        "excluded": excluded,
        "objects": len(copies),
        "triangles": triangles,
        "materials": len({m for o in copies for m in o.data.materials if m}),
        "bytes": output.stat().st_size,
        "bounds_z_up": expected,
        "adjustments": adjustments,
        "material_fixes": fixes,
        "reimport": "PASS",
        "nodes": [{"name": o.name, "kind": o["jelly_kind"]} for o in copies],
    }
    print("MINDFULNESS_EXPORT_OK", key, triangles, output.stat().st_size)
(DIRECTORY / "export-report.json").write_text(
    json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf8"
)
