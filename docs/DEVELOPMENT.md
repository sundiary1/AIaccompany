# 本机开发指南

当前 Demo 的启动见 [README](../README.md)，继续开发前先读 [PROJECT_CONTEXT](PROJECT_CONTEXT.md)。模板的完整 PostgreSQL 后端位于 `backend/app/`，不需要为本机 AI Demo 启动它。

所有后续 UI 与 3D 开发遵循 [AGENTS.md 的全局视觉一致性规则](../AGENTS.md)。以仓库当前页面、主题变量和通用组件为基准，优先复用现有 Animal Island UI 封装与配套图标；保留已有美化成果，界面改动完成后进行桌面与手机截图验收。

沙盘 `/sandplay` 的原版绘制与浏览器存档可仅用前端运行；SQLite 多作品功能需要本机 Demo 服务端。首次 CDN 加载需要网络，不调用模型。源码边界与回归见 [V0.7 说明](SANDPLAY_DEMO_V07.md)。不要格式化原 HTML；运行副本仅允许受完整性测试保护的模块桥接片段，其他适配在独立宿主文件。

## 配置与数据

- 服务端配置：`backend/demo_ai/.env.local`，从同目录 `.env.example` 创建一次。
- 前端 `frontend/.env.demo` 只有公开演示标志，不含密钥。
- 数据库默认 `backend/demo_ai/data/mind_island_demo.sqlite3`，可用服务端 `DEMO_DATABASE_PATH` 覆盖。
- 根目录 `.env.example` 属于保留的原模板。当前 Demo 使用专用配置，不依赖根 `.env`。
- 未加密数据库与开发快照仅本机使用；应用删除不会自动清除手动备份。

首次启用记忆需在聊天 → 记忆信箱中明确授权。自动提取和使用已有记忆可分别暂停；临时聊天完全隔离。

```dotenv
# 可选：留空时复用 AI_MODEL、AI_BASE_URL 和 AI_API_KEY
MEMORY_MODEL=
MEMORY_MAX_OUTPUT_TOKENS=768
MEMORY_TIMEOUT_SECONDS=20
MEMORY_DAILY_CALL_LIMIT=20
MEMORY_MAX_ATTEMPTS=2
```

代理固定 `127.0.0.1:8001`、单进程，前端固定 `127.0.0.1:5174`。不要绕过来源校验或直接公网开放。设置只控制费用边界，不替代用户授权。

## 验证命令

安装开发依赖后，在根目录执行：

```powershell
backend/.venv-demo/Scripts/python.exe scripts/check_repository.py
bun run --filter frontend check:demo
bun run --filter frontend test:sandplay
bun run --filter frontend test:islands
bun run --filter frontend test:mandala
bun run --filter frontend test:mindfulness
bun run --filter frontend build
```

在 `backend` 中执行：

```powershell
.\.venv-demo\Scripts\python.exe -m unittest discover -s demo_ai/tests -v
.\.venv-demo\Scripts\python.exe -m ruff check --target-version py313 demo_ai
.\.venv-demo\Scripts\python.exe -m ruff format --check --target-version py313 demo_ai
```

提交前 `python scripts/check_repository.py --staged` 检查准确的 Git 暂存内容。脚本只输出风险文件名，不打印密钥值。可选 pre-commit 配置使用相同边界，需要先激活 Demo 虚拟环境并确保 Bun 在 PATH。

仓库检查器自身的测试：`python -m unittest discover -s scripts/tests -v`。开发环境与 CI 使用 `requirements-dev.txt` 引用的完整运行依赖锁定文件。

`lint` / `check:demo` 不改文件；确需修复时显式运行 `lint:fix` 并审阅 diff，不使用 unsafe 自动修复。GitHub 的 Demo CI 只运行 Mock 后端测试、规范检查与前端构建，不部署、不读取供应商密钥、不依赖 Docker。

Bun 在 Windows 当前终端不可用时：

```powershell
$env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
```

## 资产与目录

原始资产在 `assets/blender/`，运行副本在 `frontend/public/models/`。两处承担编辑与 WebGL 发布职责，不能当作无用重复文件删除。保留参考图、bpy、blend、GLB、材质/面数验证与四视图。

曼陀罗书屋 `/mandala` 不需要后端，画作仅在当前页面编辑，导出 PNG 留存。绘图核心来源、模型压缩副本、数据接口和测试见 [V0.8.0](MANDALA_DEMO_V080.md)。原始 22 MB 木屋副本本机保留并精确忽略，版本库保留完整可编辑压缩工程，不能为了通过检查放宽全局资产限制。

双岛资产、可重复 Blender 导出与预留步行数据见 [V0.7.2](ISLAND_WORLD_V072.md)。V0.8.0 后续布局由 `getIslandDefinitions(compact)` 管理，`getCloudBridges(compact)` 生成两条连接各三朵云。角色尚不能过桥；不要把预留区域当作已完成的寻路网格。

`docs/screenshots/` 仅放已确认无真实对话的 Mock 演示截图。原始录制、测试库、构建、缓存和快照放入 Git 忽略的本机目录，不作版本库内容。

## 常见问题

正念 `/mindfulness` 的模型和播放器无需后端。正式音频当前为空；将获授权文件放入 `frontend/public/audio/mindfulness/`，在 `frontend/src/components/Mindfulness/mindfulnessTracks.ts` 添加唯一条目，时长来自实际媒体元数据。不要把 `output/mindfulness/` 中的测试 WAV 加入正式曲库。模型源文件、导出命令、截图和验收见 [V0.9.0](RAINFOREST_MINDFULNESS_V090.md)。

前端能打开但聊天不可用：检查代理是否启动及配置是否齐全。端口占用时先确认进程用途，不盲目终止。没有真实 API 配置时用 `AI_MODE=mock` 验证，不编造地址或模型。

数据库忙或只读时 UI 必须反馈失败。不要删除数据库“修复”历史，也不要用第二个服务进程同时打开同一库。新增迁移必须保留已有消息并用临时 SQLite 测试。

本机浏览器关闭后服务端进程仍可能运行；关机前保存编辑内容。正常关机不强制关闭未保存应用。
