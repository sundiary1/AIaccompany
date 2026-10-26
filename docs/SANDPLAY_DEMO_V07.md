# Mind Island Demo V0.7：沙屿多作品管理

2026-10-25，本地完成，等待视觉与交互验收。实际页面：<http://127.0.0.1:5174/sandplay>。

## 后续视觉精简

顶部导航与作品操作合并为一条约 65px 的工具栏，删除隐私说明、未命名占位和常驻保存状态文字；已打开作品的真实名称仅桌面按需显示。保存失败与未保存离开提醒仍保留。

通过 `sandplay-host.css` 隐藏原 HTML 的 YOUR PRIVATE LITTLE WILDS、侧边诗句和沙具栏操作提示，并收紧底栏留白；原始 HTML、模型工厂、浏览器存档与 SQLite 未改。修改文件仅 `SandplayPage.tsx`、`sandplay.module.css` 和宿主 CSS。

实际 Mock 回归：桌面与 390px / 320px 手机单行工具栏无溢出，设置和作品库可打开；保存失败可见、重试成功、取消离开保留编辑、保存后离开与 iframe 卸载正常，80 种沙具保留。Biome、TypeScript / Vite、沙盘数据和原版资产保护检查通过。未调用真实 AI 或读写用户数据库。

[精简桌面截图](screenshots/sandplay-minimal-toolbar-desktop.png) · [精简手机截图](screenshots/sandplay-minimal-toolbar-portrait.png)

## 使用与启动

根目录 `bun run dev:demo`；另一终端在 `backend` 执行 `.\.venv-demo\Scripts\python.exe -m demo_ai`。固定前端 127.0.0.1:5174、服务端 127.0.0.1:8001，沿用 server-only `.env.local`。本轮未改密钥、供应商配置，不需要新增依赖、Docker、PostgreSQL 或模型 API 调用。

在“我的作品”中新建空白作品，摆放后点外层“保存”，首次填写名称。已有作品修改后约 1.5 秒自动保存；“另存为”创建独立 UUID。列表可打开、重命名和确认删除。未保存切换/离开时可取消并先保存，浏览器刷新/关闭也提示未保存修改。示例不自动入库，打开作品不会触发覆盖保存。

外层“保存 / 另存为”写本机 SQLite；原版 iframe 内“保存作品 / 恢复”继续使用浏览器 localStorage。两种存储明确区分。“导入浏览器旧存档”由用户主动触发，先载入画布并命名，确认后才入作品库；不会删除或改写旧存档。

## 文件清单（V0.7 相对 V0.6）

新增：

- `backend/demo_ai/sandplay_schema.py`、`sandplay_models.py`。
- `backend/demo_ai/repositories/sandplay_repository.py`。
- `backend/demo_ai/routes/sandplay.py`、`tests/test_sandplay.py`。
- `frontend/public/legacy/sandplay-bridge.js`。
- `frontend/src/components/Sandplay/project-api.ts`、`useSandplayBridge.ts`、`useSandplayProjects.ts`、`ProjectLibrary.tsx`。
- `frontend/tests/sandplay-bridge.test.mjs`。
- 本报告及三张 `docs/screenshots/sandplay-v07-*.png`。

修改：

- `backend/demo_ai/database.py`：增量迁移；`main.py`：独立作品 Repository/router。
- `backend/demo_ai/tests/test_history.py`、`test_memory.py`：当前版本断言改为 3，未来不支持版本改为 4，其余既有用例保留。
- `frontend/public/legacy/sandplay-v15.html`：唯一模块内桥接片段，原工厂/渲染/手势/存档函数保留。
- `frontend/public/legacy/sandplay-host.css`：工具条占用空间后的矮横屏兼容，避免视角按钮遮住原操作按钮。
- `frontend/src/components/Sandplay/SandplayPage.tsx`、`sandplay.module.css`：作品入口、保存状态、抽屉及确认表单。
- `frontend/vite.config.ts`：独立作品 API 代理；`frontend/package.json`：检查范围和纯数据测试命令。
- `scripts/tests/test_sandplay_asset.py`：原字节保护扩展为唯一桥接片段校验。
- `.github/workflows/demo-ci.yml`：已有检查流程增加桥接纯数据测试，不新增部署。
- README、CHANGELOG、当前上下文、开发指南与原版资产说明。

保留此前 V0.6 未提交改动，没有清理或重置用户文件，没有修改 GLB、AI 对话、历史、长期记忆的业务逻辑。

## 数据库与迁移

实际库：`backend/demo_ai/data/mind_island_demo.sqlite3`。自动化使用临时目录 SQLite；浏览器 QA 使用被 Git 忽略的 `output/sandplay-v07-qa.sqlite3`，不向真实库灌入测试作品。

开发前在忽略目录 `output/snapshots/` 保存一致性 SQLite 备份及当前源代码快照。数据库迁移在 `BEGIN IMMEDIATE` 内按 `PRAGMA user_version` 执行：v2 创建作品表与索引，再设 v3；v3 重启不重复建表，未来版本拒绝打开。原历史/记忆表不重建。

```sql
CREATE TABLE sandplay_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  scene_json TEXT NOT NULL CHECK(length(scene_json)<=131072),
  schema_version INTEGER NOT NULL CHECK(schema_version=6),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sandplay_projects_recent
  ON sandplay_projects(updated_at DESC,id);
```

数据库版本 3 与作品格式版本 6 是不同概念。时间为 UTC ISO 8601。SQL 参数化，短事务、WAL、1 秒 busy timeout；在线程中执行，取消请求时等待当前短事务收尾。

实际迁移结果：**2 → 3，原有 8 张表内容指纹全部不变，integrity_check=ok，真实作品表 0 条**。独立迁移测试也验证 v2 原消息/设置保持原字节与重复初始化安全。

## API 与校验

| 方法 | 地址 | 请求 / 结果 |
| --- | --- | --- |
| GET | `/api/demo/sandplay/projects` | metadata 列表，最近修改倒序；limit 1–100 / offset 分页 |
| POST | `/api/demo/sandplay/projects` | `{id,title,scene}`；返回完整作品 |
| GET | `/api/demo/sandplay/projects/{id}` | 作品及纯 JSON scene |
| PUT | `/api/demo/sandplay/projects/{id}` | `{revision,scene}` 覆盖内容 |
| PATCH | `/api/demo/sandplay/projects/{id}` | `{revision,title}` 重命名 |
| DELETE | `/api/demo/sandplay/projects/{id}?revision=N` | 只删除指定作品，204 |

响应 metadata：id/title/schema_version/revision/created_at/updated_at；完整响应另含 scene。不存在 404，版本冲突 409，非法数据 422，超大 413，读取请求超时 408，数据库忙/不可用 503，均为脱敏中文错误。

Host、Origin、loopback 客户端及 Sec-Fetch-Site 校验沿用主中间件，所有新增方法均受保护。路由在解析 JSON 前限制完整/分块请求至 128 KiB、10 秒读取超时。客户端 8 秒 API 超时。

scene 保留 `version:6 / theme / tray / objects`。80 种类型白名单与原版 defs 自动比对；最多 300 个物件；未知字段拒绝；有限数值，不接受数字字符串/布尔值；草地/荒漠；宽 10.5–24、深 7.5–18；位置中心在半宽/半深内；scale .45–1.9；rotation ±10000 弧度；飞行高度 0–3，非飞行类型 y=0。无 Three.js 实例/几何体/材质存储。

## iframe 协议

同源 postMessage，固定 `channel: "mind-island:sandplay-v15"`、`version:1`。双方检查 origin/source/version/类型，回复关联 requestId；不支持代码执行或任意地址。React 在 5 秒未收到回复时明确报错，卸载或引擎失败时拒绝所有未完成请求并清理定时器/监听器。

| 方向 | 消息 |
| --- | --- |
| 宿主 → iframe | `action: "scene:get"`，requestId，取当前 V6 JSON |
| 宿主 → iframe | `action: "scene:load"`，requestId，scene，经校验后替换 |
| 宿主 → iframe | `action: "scene:new"`，requestId，清空当前环境沙具 |
| 宿主 → iframe | `action: "scene:legacy"`，requestId，主动读取并规范化当前来源旧存档，不写存档 |
| iframe → 宿主 | `event: "scene:result"`，requestId，ok，scene/sequence 或安全错误 code |
| iframe → 宿主 | `event: "scene:changed"`，sequence，通知内容变化 |

兼容原加载状态与 `status / open-settings` 消息。原 ES Module 内通过 `installSandplayBridge({serialize,load,clear,types})` 传递闭包，不假设 `window.serialize`。加载前完整校验，失败尝试回滚原场景。

监听 click/input/pointerup/pointercancel/keyup 后延迟比较 JSON，仅数据改变才通知；没有逐帧同步 React 状态。加载/新建使用确认后的基线，不制造自动覆盖。实际动作完成后取最新 JSON，不从 DOM 拼凑 Three.js 数据。

只读原版 SHA-256 仍为 `1beaa99df80b5979b26f4555020d692c4bc93ca0ef58ff12fdc7a7889b48f53b`，123347 bytes。运行版移除宿主两行引用及唯一标记桥接块后，与原文件逐字节一致。

## 保存一致性

- 一个页面只有一个写入流程，已有作品改动防抖 1.5 秒；未命名、示例不自动建档。
- 仅后端确认后更新 revision/已保存基线；保存过程中新增编辑仍保留，后续再保存。
- POST 使用稳定客户端 UUID，响应丢失后相同内容重试不会重复创建。
- PUT 事务内检查 revision；仅紧邻修订且内容完全相同的丢响应重试作为幂等成功。不同旧内容冲突绝不覆盖。
- PATCH/DELETE 也要求当前 revision。跨页面冲突保留当前画布，提示另存或重新打开最新版本，不静默合并。
- 网络/超时/数据库异常显示失败，保留当前画布，自动重试不会无限循环；可手动重试。
- 删除当前作品后脱离已有 ID，不再自动重建；画布可另存。切换前有未保存确认；在途事务期间阻止切换。

## 实际验证

全部使用独立测试库/Mock，**真实 DeepSeek 调用 0 次**。

| 检查 | 结果 |
| --- | --- |
| 三件不同作品 | 草地溪流/荒漠仙人掌/飞行沙具；新建不覆盖，刷新全部存在 |
| 恢复内容 | 坐标、旋转、scale、云朵 1.8 / 飞机 2.2 高度准确；主题/尺寸正确 |
| 自动保存 | 已有作品添加沙具后入库；写入期间再编辑也保留，两次顺序写入完成 |
| 网络失败 | 阻断 PUT，显示保存失败，画布保留，数据库 revision 不变；恢复后手动保存成功 |
| 并发冲突 | 两个真实页面编辑同 ID，旧页明确 409，胜出内容不变；旧页成功另存 |
| 未保存切换 | 取消确认后仍留在原作品，当前内容保留 |
| 重命名/删除 | 改名成功；取消删除保留；确认仅删除目标；删除当前作品等待后未被自动重建 |
| 旧存档 | v1/v2 数组、v4 snow→sand、v6 主动导入；保留高度/旋转/缩放及原始 localStorage 字符串；没有存档明确提示 |
| 80 沙具/9 分类 | 再次逐一创建、遍历全部分类，无工厂缺失 |
| 原交互 | 鼠标射线拖动、复制/删除/缩放/旋转、高度/尺寸/主题、四视角、自由旋转/滚轮缩放通过 |
| PNG/原保存 | 实际下载非空 PNG；原浏览器保存/恢复和旧版本逻辑通过 |
| 手机 | Edge 原生 CDP touch 模拟 390×844 / 844×390：栏滑动、拖入/移动、复制/删除、四视角、保存/自动保存、打开作品和返回通过，无父页滚动 |
| 卸载 | 三轮路由往返 frame detached，旧 RAF 停止，无岛屿页面残留 iframe |
| 加载异常 | 阻断 CDN 明确报错并卸载；恢复后重试成功，旧存档不变 |
| 桥接安全 | 非匹配 source/version 消息被忽略；纯数据校验拒绝非法类型与数值 |
| AI/记忆 | Mock 聊天、历史、授权记忆提取及路由往返通过；设置与消息未被沙盘操作修改 |

自动化结果：**86 项后端测试（新增 13 项）、4 项桥接纯数据测试、6 项脚本测试全部通过；TypeScript 与 Vite 构建通过；前端 41 文件 Biome、后端与资产测试 Ruff 检查/格式检查通过；仓库扫描 359 文件、0 错误。** 保留已有 3D chunk >500 kB 警告。

最终命令结果记录见本机忽略目录 `output/sandplay-v07-backend-tests.log`、`output/playwright/sandplay-v07-*.log`。前端纯数据测试命令 `bun run --filter frontend test:sandplay`；全套后端、TypeScript/Vite、Ruff、Biome、仓库检查与脚本测试按开发指南执行。

## 截图

- [桌面作品列表](screenshots/sandplay-v07-desktop.png)
- [手机竖屏作品列表](screenshots/sandplay-v07-mobile-portrait.png)
- [手机横屏作品列表](screenshots/sandplay-v07-mobile-landscape.png)

全部为人工合成的 QA 作品，不包含真实聊天内容。

## 已知边界

- SQLite/手动备份未加密，单机单用户，无正式账户、云同步、作品撤销历史或跨设备同步。不得公开绑定服务。
- 旧数据受浏览器及同源规则限制，localhost/127.0.0.1、端口、不同浏览器、file:// 之间无法直接读取；未声称自动迁移其他来源。
- 保留原浏览器保存按钮与新增 SQLite 保存入口，使用时注意所在区域；原版编辑浮层在小屏仍会占据画布空间。横屏使用受控宿主布局兼容，未重写原 UI。
- 手机为触摸模拟，iOS/安卓实体机与软键盘、300 沙具的低端设备性能未系统实测。
- 冲突需要另存或重新打开；断网时画布只在当前页面保留，请勿强行关闭/刷新。浏览器确认无法保证强制结束进程时保存。
- 首次 Three.js CDN 仍需网络；原 3D bundle 大小和 THREE.Clock 弃用提示保留，既有 Starlette TestClient httpx 弃用提示未在本轮升级依赖。
- 完整 V15 没有被重构为 React/R3F。下一步可先抽出版本化纯数据模块和逐步资源释放策略，再考虑工厂/手势模块化；本轮到此停止，不增加心理解释或 AI 分享。
