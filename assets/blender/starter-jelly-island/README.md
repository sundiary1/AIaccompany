# Starter Jelly Island V1.0

本资产使用 Blender 5.2.3 LTS 的 bpy 程序化生成。建模、保存、GLB 导出、两张预览渲染与独立场景重新导入均已实际执行成功，进程退出码为 0。

## 文件

```text
starter-jelly-island/
├── references/README.md
├── scripts/create_starter_island.py
├── source/starter_jelly_island.blend
├── exports/
│   ├── starter_jelly_island.glb
│   ├── validation_report.json
│   └── checksums.sha256.json
├── renders/
│   ├── starter_jelly_island.png
│   └── starter_jelly_island_reimport.png
└── README.md
```

## 实际执行命令

在 Windows PowerShell 中执行：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --factory-startup --threads 8 --python-exit-code 1 `
  --python 'assets/blender/starter-jelly-island/scripts/create_starter_island.py' `
  -- --samples 48
```

无需 Blender 外部插件或 Python 依赖。脚本默认按自身位置定位资产根目录，使用固定随机种子 2401；重新执行会替换该资产自己的 blend、GLB、预览和验证报告。建模运行在独立的后台 Blender 进程中，不修改用户已打开的场景，也不保存用户首选项。

## 模型设计

- 圆润的近方形地块，草皮边缘像软垫，底部向内圆收。
- 顶面为轻微缓坡和隆起；前中部保留相对平缓的空地。
- 浅棕、深棕和更深底层分别建模，层间边界有少量起伏。
- 后侧两棵大小不同的低多边形树，前景少量灰石、三朵奶油色小花和六簇草。
- 不含小屋或其他建筑；没有软体模拟、骨骼或任何内置动画。
- 材质仅使用基础 Principled BSDF 的颜色、粗糙度和默认介电反射；不需要外部贴图或 glTF 扩展。

## 结构、尺寸与统计

统计仅包含导出的模型，排除预览场景的相机、灯光和地面：

| 项目 | 实测值 |
| --- | --- |
| 对象 / GLB 节点 | 32：25 个网格对象 + 7 个 Empty |
| Blender 原始多边形 | 1,935 |
| 导出三角面 | 2,910 |
| 源网格顶点 | 1,573 |
| 导入后的顶点 | 3,768，因三角化及法线 / 材质边界拆分增加 |
| 模型材质 | 15 |
| GLB primitives | 34，可作为基础绘制批次数参考；实际渲染还受阴影等因素影响 |
| GLB 文件大小 | 127,580 bytes，约 124.59 KiB |
| 地块宽 × 深 × 厚 | 约 9.09 × 8.69 × 1.48 m |
| 含树木总高度 | 约 4.31 m |
| 未来放置空地 | 约 3.6 × 3.5 m |
| 纹理 / 动画 / 骨骼 | 均为 0 |

`Starter_Jelly_Island` 是位于原点的根节点，供后续整体浮动和统一缩放使用。主要子节点包括：

```text
Starter_Jelly_Island
├── Island_Base
├── Soil_Layer_Dark
├── Soil_Layer_Light
├── Grass_Top
├── Tree_01
│   ├── Tree_01_Trunk
│   └── Tree_01_Canopy_01 … 03
├── Tree_02
│   ├── Tree_02_Trunk
│   └── Tree_02_Canopy_01 … 03
├── Rocks
├── Flowers
├── Grass_Clumps
└── Future_Placement
```

树木各自的组原点位于树脚。`Future_Placement` 是无可见几何体的空节点，记录空地尺寸；其 Blender 坐标为约 `(1.1, -0.6, 0.668)`。它不会在预览中显示占位框。

Blender 文件采用米制和 **Z 向上**，地块中心接近原点。GLB 按 glTF 标准转换为 **Y 向上**；重新导入 Blender 后已核对 Z-up 世界范围一致，误差阈值为 2 mm。GLB 根节点仍在原点，没有把预览地面烘入模型。

## 预览和质量检查

两张图均为 1600 × 1600 PNG，使用正交相机、固定斜俯视角、奶油色背景、三个柔光面光源及 Cycles CPU 渲染，48 samples 加降噪。相机、灯光、世界背景和承接阴影的平面均属于 `PREVIEW_ONLY_*` 集合，不导出到 GLB。

已实际查看源模型 PNG 和重新导入后的 PNG。首版存在颜色偏浅、土层对比不足的问题；修订时加深了绿色和分层土色，降低了相机高度，并增强草地局部缓坡后重新生成。最终确认：

- 地块宽厚比例符合目标，圆润轮廓和草皮包边清楚。
- 顶部保留轻微起伏，未来放置区域没有被装饰占用。
- 两棵树尺寸有区分，没有遮住大部分空地。
- 分层土壤可读，花草和石块数量克制。
- 主体完整入镜，柔和投影呈现漂浮感，无可见缺面或材质丢失。

## GLB 独立场景验证

脚本创建空的 `GLB_Independent_Reimport_Validation` 场景，再调用 `bpy.ops.import_scene.gltf` 从导出的 GLB 读取模型，未复用源场景中的模型对象。验证结果为 **PASS**：

- 25 个网格、2,910 个三角面、15 个材质与源模型一致。
- 世界包围范围与源模型一致；根节点位置正确。
- 所有网格非空且具有 Principled BSDF 材质，没有图像节点。
- 没有预览相机、灯光、骨骼或动画；GLB 没有外部缓冲区和纹理依赖。
- 对重新导入的模型重新搭建预览灯光并渲染，已实际查看其 PNG。

详细机器可读结果见 [exports/validation_report.json](exports/validation_report.json)。源 `.blend` 在独立验证前保存，因此交付文件只包含原始建模 / 预览场景，不混入验证副本。

`checksums.sha256.json` 是本次交付文件的 SHA-256 快照；重新生成或修改资产后应重新计算快照。

## 已知限制与后续建议

当前没有阻断交付的问题。Blender 5.2.3 对 `use_nodes` 发出面向 Blender 6.0 的弃用警告，但本轮保存、导出、渲染和重新导入均成功；若未来升级至 Blender 6，再调整对应 API。

尚未进行真实手机 WebGL 帧率与不同设备色彩表现验证。未来网页显示的亮度、阴影与 Blender 预览可能因灯光和色彩管理而不同；需要在后续接入阶段单独校准。当前模型已很轻，后续可根据实测决定是否共用或合并部分材质、实例化重复装饰。

本轮仅新增此资产目录，没有修改 React 页面、启动后端、修改数据库、制作其他岛屿或开展前端接入。
