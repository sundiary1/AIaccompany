# Mind Island Demo V0.6：沙屿 V15 接入

2026-10-25。本地待视觉与交互验收。

页面：<http://127.0.0.1:5174/sandplay>；从 <http://127.0.0.1:5174/island-preview> 的「沙屿 · 心理沙盘」进入，顶部「返回心屿」返回。前端继续用根目录 `bun run dev:demo` 启动，沙盘无需后端。

## 原版保留与实现

实际附件名为 `沙屿_心理沙盘_V15_溪流优化.html`，不带“(1)”。完整阅读 2178 行后确认包含 80 种沙具、九大分类及 V15 溪流；不是替代实现。

只读参考：`assets/legacy/sandplay-v15/sandplay-v15.original.html`。123347 bytes，SHA-256：

```text
1beaa99df80b5979b26f4555020d692c4bc93ca0ef58ff12fdc7a7889b48f53b
```

运行版仅多出宿主 CSS、JS 两行引用；移除两行后与原版字节完全一致。测试保护大小、校验和、完整原文、80 个工厂和九大分类；Git 属性避免自动转换换行。没有改写模型、原 CSS、渲染器、手势、存档或截图函数。

React 只负责导航、存储说明和加载状态。固定同源 iframe 内独立使用原 CDN Three.js **0.161.0**，不与主项目 R3F 的版本混用。仅访问此路由才挂载，离开即卸载；没有把旧 CSS/window 事件注入父页。

两个必要的兼容适配：原版窄屏隐藏设置按钮，外层提供调用同一面板的「设置」入口；原版矮横屏会让素材栏遮挡地块/视角按钮，宿主媒体查询将画布等比缩放上移、原视角按钮改为右上横排。没有修改相机参数和模型坐标，变换后的横屏射线拖放已实际验证。

消息仅包含版本化的 ready/error、状态查询和打开设置命令，检查 source/origin，不读取或传输作品。异常或 25 秒未就绪显示失败提示，卸载失败 frame；重试不清除存档。同源 iframe 用于样式和生命周期隔离，不是运行任意不可信 HTML 的安全容器。

## 源码分析摘要

- `defs → makeModel → refineModel → modelTargets`：80 个工厂、统一比例，九类及全部总览。
- `resetGround`：草地/荒漠、分层地块、缓存 CanvasTexture、实例化草簇；尺寸变化约束并保留物件。
- `Raycaster + Y=0 plane`：选择、拖动、边界约束；素材栏区分横向浏览与向上拖入。
- 正交相机与 OrbitControls：四预设、自由旋转及缩放。
- `buildCreek`：64 段曲线、多层河岸/水面、9 条几何波纹；原 tick 更新透明度。
- `serialize` 返回普通 JSON；截图仍由原 renderer/canvas 导出 PNG。

## 文件清单

新增：

- `assets/legacy/sandplay-v15/`：原版、manifest 与说明。
- `frontend/public/legacy/`：运行 HTML、`sandplay-host.js`、`sandplay-host.css`。
- `frontend/src/components/Sandplay/SandplayPage.tsx`、`sandplay.module.css`。
- `frontend/src/routes/sandplay.tsx`。
- `scripts/tests/test_sandplay_asset.py`：两项完整性测试。
- 本文及四张 `docs/screenshots/sandplay-v06-*.png`。

修改：`IslandPreviewPage.tsx` 增加入口；`routes/__root.tsx` 对沙盘隐藏模板横幅/Devtools；`routeTree.gen.ts` 自动生成；`frontend/package.json` 扩展检查范围；`frontend/biome.json` 排除需原样保留的 HTML；`.gitattributes` 保留 HTML 字节。README、当前上下文、开发指南和版本记录同步更新。

未新增依赖，未修改后台代码、数据库结构、GLB 或 Blender 资产。

## 实际测试结果

Playwright CLI 驱动 Edge/Chromium 实际 WebGL 渲染。

| 功能 | 结果 |
| --- | --- |
| 80 种沙具 | 逐一经原 UI 创建并保存，80 个唯一类型，工厂无缺失 |
| 九大分类 | 全部切换，合计覆盖 80 种；横向浏览通过 |
| 添加/拖入/选中/移动 | 鼠标 Raycaster 通过，手机原生触摸拖入/移动通过 |
| 缩放/旋转/复制/删除 | 原控件及保存数值正确，触摸复制/删除通过 |
| 飞行高度 | 云朵高度 1.8 正确保存与恢复 |
| 环境及尺寸 | 草地/荒漠切换；18.5 × 12.75 保存恢复一致 |
| 相机 | 四预设、鼠标自由旋转与滚轮缩放的实际画布变化通过 |
| 溪流 | 原几何体可添加并保存，截图包含溪流 |
| 保存/恢复/清空/重置 | 通过；刷新后点“恢复”，JSON 与保存内容一致 |
| 旧存档 | v1/v2 数组、v4 对象、snow→sand 兼容通过；未知类型跳过 |
| PNG | 实际下载非空 PNG，见本机 `output/playwright/sandplay-v06-export.png` |
| 手机 | 390×844 竖屏、844×390 横屏；滑动、设置、四视角、返回通过，无外层滚动；横屏适配后的拖放通过 |
| 卸载 | 三次往返，旧 frame detached，无残留 iframe，旧 RAF 计数不再增加 |
| CDN 失败 | 阻断 jsDelivr 后明确报错并卸载 frame；恢复网络后重试成功，存档不变 |
| AI 隔离 | 独立沙盘操作期间 `/api/demo/*` 请求 0，没有作品解释或心理推断 |
| 聊天/记忆回归 | 独立 Mock 库完成流式聊天与授权提取；往返后消息、会话及设置不变，真实模型调用 0 |

检查：后端 **73 项 Mock 测试通过**；脚本 **6 项测试通过**（新增 2 项）；前端 **36 文件 Biome 通过**；TypeScript + Vite 构建通过；新测试 Ruff 通过；私密文件扫描通过。

保留既有 3D bundle >500 kB 和 `THREE.Clock` 弃用提示。新增沙盘 React 路由 JS 约 3.49 kB，原版 HTML 与 CDN 独立加载。本机测试脚本和日志在被忽略的 `output/playwright/sandplay-v06-*`。原服务端配置已恢复，原库完整性为 `ok`，记忆开关保持原值。

## 实际截图

- [桌面与溪流](screenshots/sandplay-v06-desktop.png)
- [手机竖屏](screenshots/sandplay-v06-mobile-portrait.png)
- [手机横屏](screenshots/sandplay-v06-mobile-landscape.png)
- [CDN 失败提示](screenshots/sandplay-v06-cdn-error.png)

## 数据与已知兼容边界

存档键仍为 `sand-island-scene-v6`，结构仍是 `version / theme / tray.width / tray.depth / objects`，物件为 `type / x / y / z / rotation / scale`。界面明确说明“当前浏览器本地，非账户云端”；没有 SQLite 接入或自动上报。

原版需手动点“保存作品”和“恢复”；打开仍显示示例场景，离开前需保存。`file://`、localhost、127.0.0.1、不同端口/浏览器/配置文件有不同 localStorage，格式兼容不等于自动搬迁其他来源的旧作品。

手机测试是触摸模拟，不等于实体设备验收。原编辑浮层会占据部分操作区，切换视角前可先关闭。模拟中极快拖放后紧接按钮触摸有时需再次点击；本轮保留原手势逻辑。iOS 真机、浏览器工具栏/安全区域和低端机大量物件性能未系统实测。首次 CDN 无网络会失败，当前不提供缩水替代场景。

## 后续模块化建议

先抽离纯 JSON 的版本化校验与序列化，再拆分 80 个工厂和资源释放策略，最后迁移相机、手势及 UI 状态；以原版和本轮浏览器测试为基线，不同时重写所有系统。

后端作品库需单独设计授权与版本化 JSON API。分享给小屿、AI 讨论或任何解释功能均需另行开发。本轮在此停止，等待视觉与交互验收。
