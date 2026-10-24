> 历史交付记录；当前启动与约定见 [开发指南](../DEVELOPMENT.md) 和 [项目上下文](../PROJECT_CONTEXT.md)。`<PROJECT_ROOT>` 表示项目根目录。

# Mind Island（心屿）基础工程初始化记录

检查日期：2026-10-24（Asia/Shanghai）。本轮仅初始化模板并验证运行条件。

> 第二轮更新（2026-10-24）：已按新范围在不使用 Docker、不安装 PostgreSQL、不启动后端的条件下启动前端，并增加显式启用的只读演示模式。后续前端操作以 [FRONTEND_DEVELOPMENT.md](FRONTEND_DEVELOPMENT.md) 为准。下文保留首轮检查历史，其中“前端未启动”和 Docker 修复步骤不再代表当前前端状态。

## 来源与变更范围

- 初始工作目录为空，没有覆盖已有文件。
- 在当前目录直接克隆官方仓库：https://github.com/fastapi/full-stack-fastapi-template
- 分支：master；基线提交：`b1125d8839482cb7bbae603ddc6d0081bf87532e`。
- 保留官方 Git 历史，`origin` 仍指向官方模板；尚未创建 Mind Island 的远程仓库或推送。
- 仅新增本记录；模板代码、UI、配置、锁文件、模型及迁移均未改动。
- 未安装新工具、下载 Python、引入业务依赖、接入 AI、创建 3D 场景或使用生产数据。

## 当前目录

```text
AI心理陪伴/
├── .agents/、.claude/      模板附带的开发辅助资源
├── .github/workflows/     持续集成及部署工作流
├── .vscode/               编辑器配置
├── backend/
│   ├── app/
│   │   ├── api/           API 路由与依赖
│   │   ├── core/          配置、认证与数据库连接
│   │   ├── alembic/       模板原有数据库迁移
│   │   ├── email-templates/
│   │   ├── models.py
│   │   └── main.py
│   ├── scripts/           初始化、检查及测试脚本
│   ├── tests/
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── src/               页面、组件、路由、自动生成的 API 客户端
│   ├── public/
│   ├── tests/             Playwright 测试
│   ├── .env
│   └── package.json
├── packages/react-email/  邮件模板工作区
├── hooks/、scripts/、img/
├── .env                   模板自带的本地开发配置
├── .python-version        3.14
├── compose.yml
├── compose.override.yml   自动叠加的本地开发配置
├── compose.deploy.yml     部署配置
├── package.json、bun.lock
├── pyproject.toml、uv.lock
├── README.md、development.md
└── INITIALIZATION.md
```

## 技术栈

以下为锁文件版本或镜像标签，不代表依赖已安装或镜像已下载：

| 层级 | 技术与版本 |
| --- | --- |
| 前端 | React 19.3.0、TypeScript 6.0.3、Vite 8.3.1 |
| UI / 数据 | Tailwind CSS 4.3.3、shadcn/ui、TanStack Router / Query |
| 后端 | Python 要求 >=3.14,<4.0；FastAPI 0.141.1 |
| 数据层 | SQLModel 0.0.47、Pydantic 2.13.5、Psycopg 3.3.6、Alembic 1.20.0 |
| 数据库 | PostgreSQL 镜像标签 postgres:18，具体补丁版本尚未验证 |
| 检查 | Pytest 9.1.1、Ruff 0.16.9、Biome 2.5.14、Playwright 1.63.0 |
| 服务 | Docker Compose、Traefik、Mailpit、Adminer |
| 依赖管理 | Bun 工作区和 bun.lock；uv 工作区和 uv.lock |

模板已有登录、用户和条目管理、密码恢复、邮件模板、测试及部署配置。Three.js、React Three Fiber 和 PWA 能力尚未加入。

## 环境检查

| 项目 | 实际结果 |
| --- | --- |
| Git | 2.54.0.windows.1；官方仓库克隆成功 |
| Node.js / npm | v24.15.0 / 11.12.1 |
| Bun | 未在 PATH 或用户常见安装位置找到；启动命令无法运行 |
| Python | python 命令为 3.13.14；py 默认为 3.11.8；uv 另发现已有 3.12.14；未找到 3.14 |
| uv | 0.12.6，位于 C:\Users\26936\.local\bin\uv.exe，但未加入当前 PATH |
| Docker CLI / Compose | 29.4.2 / v5.1.3 |
| Docker Desktop | 已安装；日志标识为 4.72.0；尝试启动后发生后端崩溃，Engine 不可用 |
| 网络 | GitHub 页面读取和 Git 克隆成功；包仓库及容器镜像拉取尚未验证 |

已读取根 README、development.md、backend/README.md、frontend/README.md、依赖配置和 Compose 文件。保留官方 `.env` 的开发模式、占位密码、localhost 数据库和本地 SMTP 设置；没有新增或写入真实密钥。

## 实际执行结果

| 操作 | 结果 |
| --- | --- |
| git clone | 成功 |
| docker compose -p mind-island config --quiet | 通过；仅验证 Compose 配置，不代表容器能启动 |
| 解析 package.json | 3 个文件通过 JSON 解析 |
| 解析 TOML | 根及后端 pyproject.toml、uv.lock 全部通过 |
| Python 3.13 AST 预检 | 40 个 Python 文件中 39 个可解析；deps.py 第 36 行使用 Python 3.14 的异常捕获语法，3.13 无法解析。此检查不能替代要求版本下的检查 |
| uv sync --frozen --no-python-downloads（backend） | 失败：No interpreter found for Python 3.14；没有自动下载解释器 |
| bun run dev（根目录） | 失败：bun 命令不存在；前端未启动 |
| uv run --frozen --no-python-downloads fastapi dev（backend） | 失败：缺少 Python 3.14；后端未启动 |
| docker info（启动 Desktop 前） | 失败：找不到 dockerDesktopLinuxEngine 命名管道 |
| 启动已安装的 Docker Desktop | 进程启动，但日志确认后端随后崩溃 |
| docker compose -p mind-island up -d db mailpit | 退出码 1：unable to get image 'postgres:18'，无法连接 dockerDesktopLinuxEngine；服务未启动 |
| Docker 状态诊断命令 | 等待后返回无法连接 Engine / Could not retrieve status；结束时确认没有本轮残留的 Docker CLI 等待进程 |
| git diff --check / git diff --exit-code | 新增本记录前通过，模板跟踪文件无变更 |
| git fsck --no-reflogs | 通过 |

未执行数据库迁移或种子数据初始化。未运行前端构建、TypeScript/Biome 检查、后端 Pytest/Mypy/Ty/Ruff、Playwright 或 API HTTP 验证：相应运行环境和依赖尚未就绪。前后端均未成功启动，因此本记录不提供可用的本地访问地址。结束检查时，5173、5432、8000、8025、1025 均未发现监听。

## Docker 错误与手动处理

Docker Desktop 日志：`C:\Users\26936\AppData\Local\Docker\log\host\com.docker.backend.exe.log`。

本轮启动日志中的关键错误：

```text
starting services: initializing Inference manager:
listening on unix://<HOME>\AppData\Local\Docker\run\dockerInference:
remove <HOME>\AppData\Local\Docker\run\dockerInference:
The file cannot be accessed by the system.
(listener: The filename, directory name, or volume label syntax is incorrect.)
```

请先手动排查 Docker Desktop，确认 `docker info` 能返回服务端信息。当前证据只定位到 Desktop 初始化失败，尚未确认根因。没有重置 Docker、删除上述文件、修改系统设置或安装替代容器运行时。

若继续使用官方本机开发流程，还需通过官方渠道准备 Bun 和 Python 3.14，并将已有 uv 所在目录加入 PATH。安装完成后重新打开终端，确认各版本。使用完整 Docker 路径则无需在宿主机安装 Bun 和 Python 3.14，但仍需正常运行的 Docker Engine 及镜像下载网络。

## 环境修复后的官方流程

以下是待执行步骤，尚未验证成功；默认使用现有官方 `.env`，只用于隔离的本地开发。

本机开发路径：

```powershell
# 项目根目录
docker compose -p mind-island up -d db mailpit

# 后端；先确认 Python 3.14、uv 与 Git Bash 均可用
Set-Location backend
uv sync --frozen --no-python-downloads
uv run bash scripts/prestart.sh
uv run fastapi dev

# 另一个终端，项目根目录
bun install --frozen-lockfile
bun run dev
```

`prestart.sh` 将在新的本地数据库应用模板已有迁移并创建测试管理员，不应对接生产数据库。本轮未运行该脚本，未新增任何迁移或变更模型。

完整 Docker 路径（官方文档同样支持）：

```powershell
# 项目根目录；仅在 Docker Engine 恢复正常后执行
docker compose -p mind-island run --rm backend bash scripts/prestart.sh
docker compose -p mind-island watch
```

验证时应先检查容器健康状态和 API，再执行前端构建、只读格式/类型检查、后端测试及 Playwright。模板的前端 lint 脚本含自动写入选项，若只想验证而不改代码，应直接运行不带 `--write --unsafe` 的 Biome 命令。

## 下一阶段前的准备

1. 修复 Docker，并选定本机开发或完整 Docker 路径，完成实际启动及基础测试。
2. 如需本机开发，补齐 Bun / Python 3.14 / uv PATH。
3. 为 Mind Island 创建自己的 Git 远程仓库，再安排业务开发分支；当前 origin 仍是模板上游。
4. 明确首版页面、导航、移动端交互及测试验收范围；3D、PWA、AI 和业务数据模型留到后续独立任务。

官方流程依据：仓库内的 [development.md](../../development.md)、[backend/README.md](../../backend/README.md)、[frontend/README.md](../../frontend/README.md)。
