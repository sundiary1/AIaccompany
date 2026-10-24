# 本机开发指南

当前 Demo 的启动见 [README](../README.md)，继续开发前先读 [PROJECT_CONTEXT](PROJECT_CONTEXT.md)。模板的完整 PostgreSQL 后端位于 `backend/app/`，不需要为本机 AI Demo 启动它。

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

`docs/screenshots/` 仅放已确认无真实对话的 Mock 演示截图。原始录制、测试库、构建、缓存和快照放入 Git 忽略的本机目录，不作版本库内容。

## 常见问题

前端能打开但聊天不可用：检查代理是否启动及配置是否齐全。端口占用时先确认进程用途，不盲目终止。没有真实 API 配置时用 `AI_MODE=mock` 验证，不编造地址或模型。

数据库忙或只读时 UI 必须反馈失败。不要删除数据库“修复”历史，也不要用第二个服务进程同时打开同一库。新增迁移必须保留已有消息并用临时 SQLite 测试。

本机浏览器关闭后服务端进程仍可能运行；关机前保存编辑内容。正常关机不强制关闭未保存应用。
