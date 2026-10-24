> 历史交付记录；当前启动与约定见 [开发指南](../DEVELOPMENT.md) 和 [项目上下文](../PROJECT_CONTEXT.md)。`<PROJECT_ROOT>` 表示项目根目录。

# Mind Island Demo V0.2：陪伴猫小屿

2026-10-24。完成 bpy 建模、四视图渲染、独立场景重新导入和现有果冻岛接入。没有新增 npm 依赖，没有启动后端、Docker 或数据库，也没有接入 AI。

预览：<http://127.0.0.1:5174/island-preview>，沿用根目录 `bun run dev:demo`。

## 交付文件

| 路径 | 用途 |
| --- | --- |
| `assets/blender/companion-cat/references/companion-cat.png` | 用户提供的三视图原图 |
| `assets/blender/companion-cat/scripts/create_companion_cat.py` | 可重复执行的 bpy 脚本 |
| `assets/blender/companion-cat/source/companion_cat.blend` | 可编辑模型及预览相机、灯光 |
| `assets/blender/companion-cat/exports/companion_cat.glb` | Y-up、正面 +Z；不含预览相机、灯光或骨骼 |
| `assets/blender/companion-cat/exports/validation_report.json` | 源模型和重新导入的实际统计 |
| `assets/blender/companion-cat/renders/front.png` | 正面，1200×1200 |
| `assets/blender/companion-cat/renders/side.png` | 侧面，1200×1200 |
| `assets/blender/companion-cat/renders/back.png` | 背面，1200×1200 |
| `assets/blender/companion-cat/renders/isometric.png` | 斜俯视，1200×1200 |
| `assets/blender/companion-cat/renders/four_views.jpg` | 上述四图的检查拼图 |
| `frontend/public/models/companion_cat.glb` | GLB 的逐字节副本 |
| `frontend/src/components/IslandPreview/CompanionCat.tsx` | 模型加载、资源释放、Idle / Greeting / Responding 动作和点击 |

修改 `IslandScene.tsx`：复用现有 Canvas、相机、灯光、资源管理和岛屿运动组，加入角色。

修改 `IslandPreviewPage.tsx`：复用现有信息面板，加入欢迎文字、HTML 角色入口和动作状态控制；重试时同时清除两份模型加载缓存。没有修改原页面布局、CSS、首页或管理后台。

## Blender 实际执行命令

使用 Blender **5.2.3 LTS**，PowerShell：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --threads 8 --python-exit-code 1 --python '<PROJECT_ROOT>\assets\blender\companion-cat\scripts\create_companion_cat.py'
```

进程退出码 0。脚本按顺序生成模型、导出 GLB、在独立空场景重新导入验证、渲染四视图、保存工程和报告。交付文件均存在且非空。已实际查看四视图及网页桌面、手机截图；尾巴曲线和披肩叠放经过一次修正后重新生成。

| 模型统计 | 实际值 |
| --- | --- |
| 高度 | 1.169645 m，双脚底部 Z=0 |
| 节点 / Mesh 对象 | 25 / 21 |
| 三角面 | 7,788 |
| 材质 | 12，基础 Principled BSDF，无外部贴图 |
| GLB 大小 | 172,784 bytes（约 168.7 KiB） |
| 重新导入 | 三角面、材质数、边界一致；无相机、灯光、骨骼；PASS |

GLB 与前端副本 SHA-256 均为 `8e6aaeaecad4abaea50f2086fa2ee9c9d8b4a4b0448ac89a1e88b865e72e039b`。

原果冻岛 GLB 和前端副本仍为 `63a062c38a3fab38db8386d716b6236367c2f526f6869354bd9dd045cc5116dd`，未修改。

## 角色结构及动作接口

`CompanionCat_Root` 位于双脚之间的地面中心。腿部为根节点子对象，Body 下保留头部、耳朵、肩部、尾巴枢轴及独立披肩、徽章、挎包。主要部件可独立编辑；多材质 Mesh 导出时会拆成 glTF primitive。

采用父子层级动画，没有内置动画片段或骨骼。`CompanionCatState` 暴露 `Idle | Greeting | Responding`，`actionKey` 支持重复触发同一动作，`onActionComplete` 在一次动作结束后恢复 Idle；不包含聊天或网络逻辑。

- Idle：约 4.8 秒轻微呼吸、身体起伏；尾巴约 5 秒摆动。腿部不随身体呼吸移动。
- Greeting：约 2.6 秒抬爪挥手和轻微歪头。
- Responding：约 2.4 秒点头和耳朵小幅变化。
- 角色挂在现有 `Jelly_Island_Motion` 下，统一漂浮、缩放和倾斜；原岛屿动画公式保持不变。
- 草地向下射线检测决定放置高度，位置约 `[1.1, 0.67078, 0.6]`，缩放 1.5，正面朝向固定相机。
- 点击角色或触摸角色打开“你好，我是小屿。想和我聊聊吗？”，播放 Greeting；面板内“回应一下”触发 Responding。
- HTML 路径为“岛屿信息 → 认识小屿”。保留原岛屿欢迎面板、关闭和键盘焦点行为。面板打开时沿用岛屿暂停逻辑，角色欢迎动作可单独完成。
- 暂停、页面不可见时停止动画更新；减少动态效果模式下清零角色动作并按需渲染，信息入口仍可使用。动画不逐帧更新 React 状态。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| 桌面真实 GLB 渲染 | 1440×1000；形态、材质、比例正常；无明显穿模或异常阴影 |
| 手机触摸 | Edge 移动模拟，360×732，触摸点 1；DPR=3、渲染 DPR=1.5；触摸角色、关闭和 HTML 入口通过 |
| 五种尺寸取景 | 1440×1000、768×1024、390×844、320×740、844×390；每种测试 16 种保守极限姿态，岛屿和猫顶点全部入镜，无横向溢出 |
| Idle | 身体与尾巴角度实际变化，双脚局部高度保持 0；角色直接父节点为岛屿运动组 |
| 脚底接地 | 两脚原点至草地高度差约 1.59 mm 和 0.61 mm；随岛屿同组变换 |
| Greeting | 鼠标真实点击猫面部，出现指定欢迎文字；手臂旋转达到约 −2.06 rad，随后回到 Idle |
| Responding | 头部约 −0.076 至 +0.086 rad、耳朵约 −0.062 至 +0.058 rad，随后回到 Idle |
| 减少动态效果 | 岛屿姿态采样不变；身体、尾巴、手臂、头、耳朵静止；HTML 入口仍可打开面板 |
| 原岛屿动态 | 实测周期约 5.0004 秒，漂浮约 ±0.11997，缩放约 0.992–1.008 |
| 卸载释放 | 69 个几何资源、29 个材质、2 个阴影纹理全部触发 dispose；画布移除、R3F 根节点移除、WebGL 上下文释放 |
| 原 dev:demo | 演示账号登录及 Dashboard、Items、Admin、Settings 的预期内容和演示提示条均通过 |
| TypeScript / Vite | `bun run build` 实际通过（含 `tsc -p tsconfig.build.json`），退出码 0 |
| 代码规范 | 三个改动组件 Biome check 通过；全前端 78 文件只读 Biome lint 通过；bpy 脚本 Python 语法检查通过 |

全前端 `biome check ./` 的格式检查未通过：63 个诊断涉及原有文件的 CRLF/LF 等格式差异。本轮没有批量格式化无关文件。动作测试首次在系统动态偏好切换的同一帧开始采样而失败，改为等待页面偏好状态更新后重新执行，通过。

测试脚本和截图位于本地 Git 排除的 `output/playwright/`：`verify-companion-cat.js`、`verify-companion-cat-mobile.js`、`verify-cat-cleanup.js`，以及沿用的 `verify-island-motion.js`。这些是实际浏览器检查脚本，不依赖后端测试夹具。

截图：

- `output/playwright/companion-cat-island-desktop.png`
- `output/playwright/companion-cat-island-mobile.png`
- `output/playwright/companion-cat-welcome-desktop.png`
- `output/playwright/companion-cat-welcome-mobile.png`

## 已知限制与后续建议

1. 这是简化的可编辑原型，毛色边界、披肩叶片和尾巴使用低多边形几何；未还原概念图的细毛、复杂布料和眼睛质感。
2. 浏览器主场景实测 69 次绘制调用、10,702 三角面，使用模拟接触阴影；当前规模足够预览。后续若增加很多角色，可评估材质合并，同时保留动作枢轴。
3. 3D 路由构建块约 1,002.53 KB，gzip 269.81 KB，仍有 Vite 500 KB 警告；上游 Three.js/R3F 有一条 Clock 弃用提示。正常预览控制台无错误。
4. 手机为浏览器模拟，未验证实体 Android/iPhone 的帧率、功耗。隐藏页面监听保留，未把自动化结果当作实机后台功耗测试。
5. WebGL 失败时沿用原岛屿静态图片；图片不包含新角色，HTML 入口仍可使用。动作目前由 R3F 驱动，GLB 本身没有动画片段。

本轮到此停止，未开发 AI 聊天系统。
