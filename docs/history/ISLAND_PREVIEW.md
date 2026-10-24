> 历史交付记录；当前启动与约定见 [开发指南](../DEVELOPMENT.md) 和 [项目上下文](../PROJECT_CONTEXT.md)。`<PROJECT_ROOT>` 表示项目根目录。

# 动态果冻岛预览：第四轮交付记录

后续 Demo V0.2 已加入陪伴猫小屿；增量文件、统计和实际验证见 [COMPANION_CAT_V02.md](COMPANION_CAT_V02.md)。本文件保留第四轮交付记录。

日期：2026-10-24（Asia/Shanghai）。本轮只实现独立预览页，不制作新模型、不启动后端、不使用 Docker、不接入 AI 或数据库。

## 访问与启动

实际访问地址：<http://127.0.0.1:5174/island-preview>，无需登录。

项目根目录 PowerShell：

```powershell
$env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
bun install --frozen-lockfile
bun run dev:demo
```

现有首页和管理后台页面保留。新路由直接挂在根路由下，独立于受登录保护的 `_layout`。仅在此预览页隐藏模板的演示账号提示条及调试浮层。

## 本轮文件清单

新增：

- [frontend/src/routes/island-preview.tsx](../../frontend/src/routes/island-preview.tsx)：独立路由及页面标题。
- [frontend/src/components/IslandPreview/IslandPreviewPage.tsx](../../frontend/src/components/IslandPreview/IslandPreviewPage.tsx)：页面、暂停按钮、信息面板、静态降级和系统动态偏好。
- [frontend/src/components/IslandPreview/IslandScene.tsx](../../frontend/src/components/IslandPreview/IslandScene.tsx)：GLB、正交相机、取景、动画、悬停和点击。
- [frontend/src/components/IslandPreview/island-resources.ts](../../frontend/src/components/IslandPreview/island-resources.ts)：实例材质、阴影纹理、共享模型资源的引用计数及卸载释放。
- [frontend/src/components/IslandPreview/island-preview.module.css](../../frontend/src/components/IslandPreview/island-preview.module.css)：此页面及面板的局部样式。
- [frontend/public/models/starter_jelly_island.glb](../../frontend/public/models/starter_jelly_island.glb)：原 GLB 的逐字节副本，127,580 bytes。
- [frontend/public/models/starter_jelly_island_preview.webp](../../frontend/public/models/starter_jelly_island_preview.webp)：从已有 Blender PNG 缩至 1000×1000，供静态降级使用，13,540 bytes。
- 本交付记录。

修改：

- [frontend/package.json](../../frontend/package.json)、[bun.lock](../../bun.lock)：新增所需依赖并锁定版本。
- [frontend/src/routes/__root.tsx](../../frontend/src/routes/__root.tsx)：为新页面条件隐藏模板提示条和调试工具；其他路径原有行为保留。
- [frontend/src/routeTree.gen.ts](../../frontend/src/routeTree.gen.ts)：由 TanStack Router 自动生成新路由记录。
- [frontend/README.md](../../frontend/README.md)、[FRONTEND_DEVELOPMENT.md](FRONTEND_DEVELOPMENT.md)：补充预览入口。

截图和浏览器验证脚本保存在被本地 Git 排除的 `output/playwright/`；未加入项目测试依赖。工作区中之前轮次的改动均保留。

## 依赖

| 类型 | 包 | 锁定版本 |
| --- | --- | --- |
| 运行 | three | 0.186.1 |
| 运行 | @react-three/fiber | 9.8.2 |
| 运行 | @react-three/drei | 10.7.9 |
| 开发 | @types/three | 0.186.0 |

React / React DOM 保持 19.3.0。已核对 npm peerDependencies；版本选择也参考 [R3F 官方安装说明](https://r3f.docs.pmnd.rs/getting-started/installation)。信息面板复用项目已有的 `@radix-ui/react-dialog`，没有为交互安装额外依赖。

## 展示和交互

- 直接加载真实 GLB。原 Blender 资产未修改，静态副本 SHA-256 与源文件一致：`63a062c38a3fab38db8386d716b6236367c2f526f6869354bd9dd045cc5116dd`。
- GLB 已是 Y-up，不再旋转模型；相机从 Blender 预览坐标换算到 Three.js。固定正交视角，没有旋转或缩放控制器。
- 根据实际网格顶点自动计算取景，并为动态范围留边距；窗口尺寸变化时重新取景。
- 漂浮：周期 5 秒，振幅 0.12；呼吸：周期 6 秒，统一缩放 0.992–1.008；摇摆：X 轴不超过 0.5625°、Z 轴不超过 0.75°，合成倾斜低于 1°。
- 使用环境光、半球光及方向光。柔和模拟阴影随漂浮改变尺寸和透明度，没有实时反射、复杂后处理或额外接触阴影渲染通道。
- 悬停时仅增加少量材质高亮；点击岛屿或触摸点击打开“欢迎来到 Mind Island。”面板，可通过关闭按钮、右上角关闭或 Escape 关闭。
- HTML“岛屿信息”按钮提供相同入口，支持键盘，关闭后焦点返回按钮。面板显示期间暂停背景动态。
- `prefers-reduced-motion` 下停止漂浮、呼吸、摇摆；仍可打开信息。暂停 / 隐藏页面时切换到按需渲染，恢复时保留动画相位，避免时间跳变。
- WebGL 创建失败或模型加载失败时显示静态 WebP，HTML 信息按钮仍可用；可重试三维显示。正常 WebGL 显示不会加载此降级图片。

## 性能和释放

设备像素比限制为 1–1.5。动画直接更新 Three.js 对象和材质，不逐帧更新 React 状态。浏览器实测主场景为 35 个绘制调用、2,912 个三角面（模型 2,910 + 阴影平面 2）。

实例高亮使用独立材质副本，避免修改加载器缓存中的材质。资源按引用计数释放，兼容 React StrictMode 的 effect 重放；最后一个使用者卸载后释放几何体、材质、纹理并清除 GLTF 加载缓存。R3F 同时卸载画布并释放 WebGL 上下文。

## 实际测试结果

| 检查 | 结果 |
| --- | --- |
| GLB 加载 | HTTP 200，真实 WebGL 渲染；源文件和前端副本哈希一致 |
| 方向、比例、材质、阴影 | 已查看桌面和手机截图，方向正确、完整入镜，无明显穿模或异常阴影 |
| 动画采样 | 约 6.4 秒、77 次采样；漂浮约 −0.11994 至 +0.11997，估计周期 5.0005 秒；缩放约 0.99200–1.00800，采样倾斜最大约 0.897° |
| 响应式取景 | 1440×1000、768×1024、390×844、320×740、844×390 均通过；每种尺寸测试 16 种保守极限姿态，顶点均处于相机可视范围内，无横向溢出 |
| 鼠标悬停和点击 | 高亮数值从 0 增至约 0.032；指针状态正确，点击真实模型打开面板 |
| 手机触摸 | 360px 触摸模拟，设备 DPR=3、渲染 DPR=1.5；触摸模型、关闭面板和 HTML 按钮均通过 |
| 键盘 | HTML 按钮 Enter 打开，Escape 关闭，焦点返回按钮 |
| 减少动态 / 暂停 | 动画姿态变化为 0，按需渲染期间观测到 0 个新增帧；HTML 信息入口保持可用 |
| WebGL 不可用 | 测试中禁用 WebGL 上下文，静态图实际加载成功，HTML 按钮仍可打开及关闭面板 |
| 卸载 | 实测释放 34 个运行时几何资源、15 个实例材质和 1 个阴影纹理；旧画布断开、R3F 根节点移除、渲染停止、WebGL 上下文释放 |
| 原 dev:demo 回归 | 演示登录、Dashboard、Items、Admin、Settings 的预期内容及原有演示提示条均通过 |
| TypeScript / Vite | `bun run build` 实际通过，执行 `tsc -p tsconfig.build.json && vite build` |
| 代码规范 | 新组件 Biome 检查通过，全前端 77 个文件的只读 lint 检查通过；针对 Three.js group 的单条 DOM 专用规则有明确注释，键盘入口由 HTML 按钮承担 |

首次演示页回归脚本等待时间不足，已改为等待实际页面内容后重新执行，四个页面全部通过。禁用 WebGL 的故障测试会产生预期的上下文创建错误；正常预览控制台为 0 errors。

## 截图

- 桌面实际渲染（历史本机验证产物，未纳入仓库）
- 手机触摸模拟实际渲染（历史本机验证产物，未纳入仓库）
- 桌面信息面板（历史本机验证产物，未纳入仓库）
- 手机信息面板（历史本机验证产物，未纳入仓库）
- WebGL 不可用时的静态降级（历史本机验证产物，未纳入仓库）

## 已知限制

- 手机测试为浏览器视口、触摸与 DPR 模拟，尚未在实体 Android / iPhone 上验证帧率、功耗和浏览器差异。后台页可见性已监听，但自动化无头浏览器没有可靠复现后台状态，未把该项当作实机功耗验证。
- Three.js / R3F 上游内部使用 Clock，当前版本有一条弃用提示；正常页面无运行错误。没有修改第三方依赖源码或隐藏警告。
- 3D 路由的构建块约 999 KB，gzip 约 269 KB，触发 Vite 的 500 KB 提示；该路由已按需拆分，没有为消除提示而改大警告阈值。后续可根据真实设备和网络测试再优化。
- 原 GLB 在 WebGL 和 Blender 中的光照观感会有差异，本轮未继续做精细美术调色。

本轮到此停止，不制作其他岛屿，不接入 AI 对话或数据库。
