# 曼陀罗书屋资产

来源：用户提供的 `小木屋.blend`。未改变建筑造型、招牌或地块；完整检查与接入说明见 `docs/MANDALA_DEMO_V080.md`。

- `source/mandala_house.blend`：22,289,624 bytes 的原始字节副本，本机保留并精确 Git 忽略，以遵守现有 20 MiB 单文件限制。
- `source/mandala_house_compressed.blend`：890,633 bytes，可编辑的完整压缩副本，纳入版本管理。保留原场景部件、材质、已打包纹理和预览对象，并非合并后的 GLB 网格。
- `scripts/export_mandala.py`：优先读取压缩源文件；未提供压缩副本时从原件创建一次，不覆盖原件。
- `renders/isometric.png`：源资产预览。
- `validation.json`：独立场景重新导入 GLB 的实际结果。
- 运行 GLB：`frontend/public/models/islands/mandala-island.glb`。

从项目根目录执行：

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --disable-autoexec --python assets/blender/islands/mandala/scripts/export_mandala.py
```

只在导出场景中合并碎网格、补齐默认材质并转换发光节点，不覆盖源工程，不执行源工程中的脚本。原始副本 SHA-256 与 Downloads 中的用户文件完全相同。
