"""Blender --background --factory-startup --disable-autoexec --python <this file>.

Only the runtime copy is joined; the supplied editable .blend is never saved over.
"""

import importlib.util
import json
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[5]
DIRECTORY = ROOT / "assets/blender/islands/mandala"
OUTPUT = ROOT / "frontend/public/models/islands/mandala-island.glb"
spec = importlib.util.spec_from_file_location(
    "island_export", ROOT / "assets/blender/islands/scripts/export_islands.py"
)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)

original = DIRECTORY / "source/mandala_house.blend"
compressed = DIRECTORY / "source/mandala_house_compressed.blend"
bpy.ops.wm.open_mainfile(
    filepath=str(compressed if compressed.exists() else original),
    load_ui=False,
    use_scripts=False,
)
if not compressed.exists():
    # Keep the supplied 22 MB original locally; version an editable compressed copy
    # within the repository's existing 20 MiB asset budget. No source is overwritten.
    bpy.ops.wm.save_as_mainfile(filepath=str(compressed), compress=True, copy=True)
bpy.context.scene.frame_set(1)
graph = bpy.context.evaluated_depsgraph_get()
originals = [
    obj
    for obj in bpy.context.scene.objects
    if obj.type in {"MESH", "CURVE"}
    and obj.visible_get()
    and not obj.hide_render
    and obj.name.lower() != "bg"
]
copies = []
fallback = bpy.data.materials.new("Default_White")
fallback.use_nodes = True
fallback.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
    0.8,
    0.8,
    0.8,
    1,
)
fallback.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
for obj in originals:
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), depsgraph=graph)
    if not mesh.materials:
        mesh.materials.append(fallback)
    for index, material in enumerate(mesh.materials):
        if material is None:
            mesh.materials[index] = fallback
    duplicate = bpy.data.objects.new(obj.name + "_Web", mesh)
    duplicate.matrix_world = obj.matrix_world.copy()
    copies.append(duplicate)
scene = bpy.data.scenes.new("Mandala_Web_Export")
bpy.context.window.scene = scene
scene.unit_settings.system = "METRIC"
for obj in copies:
    scene.collection.objects.link(obj)
    obj.select_set(True)
bpy.context.view_layer.objects.active = copies[0]
fixes = helpers.compatible_materials(copies)
expected = helpers.bounds(copies)
before = helpers.triangles(copies)
# Hundreds of disconnected facade pieces share 13 materials; one export mesh
# preserves those material primitives without hundreds of WebGL draw calls.
bpy.ops.object.join()
visual = bpy.context.object
visual.name = "Mandala_Island_Visual"
visual["source_name"] = "Terrain"
visual["source_objects"] = [obj.name for obj in originals]
root = bpy.data.objects.new("Mandala_Island", None)
scene.collection.objects.link(root)
visual.parent = root
root.select_set(True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
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
helpers.preview(scene, [visual], DIRECTORY / "renders/isometric.png")
validation = bpy.data.scenes.new("Mandala_GLB_Reimport")
bpy.context.window.scene = validation
bpy.ops.import_scene.gltf(filepath=str(OUTPUT))
imported = list(validation.objects)
actual = helpers.bounds(imported)
assert helpers.triangles(imported) == before
assert all(
    abs(a - b) < 0.001
    for key in ("min", "max")
    for a, b in zip(expected[key], actual[key], strict=True)
)
report = {
    "source_mesh_and_curve_objects": len(originals),
    "source_unchanged": True,
    "excluded": "Bg, cameras, lights, probes and hidden objects",
    "triangles": before,
    "materials": len(
        {m for o in imported if o.type == "MESH" for m in o.data.materials}
    ),
    "bytes": OUTPUT.stat().st_size,
    "blender_bounds": expected,
    "material_fixes": fixes,
    "reimport": "passed; identical triangles and bounds, material slots present",
}
(DIRECTORY / "validation.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("MANDALA_EXPORT_OK", report["triangles"], report["bytes"])
