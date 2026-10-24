> 历史交付记录；当前启动与约定见 [开发指南](../DEVELOPMENT.md) 和 [项目上下文](../PROJECT_CONTEXT.md)。`<PROJECT_ROOT>` 表示项目根目录。

# Mind Island：独立前端开发与预览

> Demo V0.4 已完成本机 SQLite 历史。当前启动、隐私边界和测试见 [HISTORY_DEMO_V04.md](HISTORY_DEMO_V04.md)。

> Demo V0.3 已加入本机 AI 代理和真实流式聊天。配置、启动及实际验证见 [AI_DEMO_V03.md](AI_DEMO_V03.md)。下文保留此前仅前端演示模式的记录。

第二轮任务，2026-10-24（Asia/Shanghai）。本轮未使用 Docker，未安装 PostgreSQL，未启动 FastAPI，也未执行数据库迁移。

> 第四轮更新：新增无需登录的 `/island-preview`，展示真实 GLB、柔和动态和点击信息面板。支持减少动态设置与静态图片降级。交付清单、测试和截图见 [ISLAND_PREVIEW.md](ISLAND_PREVIEW.md)。下文保留独立演示模式的初始化说明。

## 环境及安装

实际版本：Node.js 24.15.0、npm 11.12.1、Bun 1.4.4。Bun 安装前不可用，现已通过 [Bun 官方 Windows PowerShell 安装脚本](https://bun.com/docs/installation) 安装到 `C:\Users\26936\.bun\bin\bun.exe`。

执行安装时使用 `-NoPathUpdate -NoRegisterInstallation -NoCompletions`，避免永久修改 PATH、添加程序注册信息或自动配置 Shell 补全。脚本先下载到临时目录并检查，再执行；未更改系统执行策略。

仓库使用根目录 Bun workspace，包含 `frontend` 和原有 `packages/react-email`。在根目录执行 `bun install --frozen-lockfile` 成功安装 426 个包；保留原有 `bun.lock`，没有引入新依赖，也没有生成 npm 锁文件。

已安装的前端主要版本：React 19.3.0、TypeScript 6.0.3、Vite 8.3.1、Axios 1.20.0、Biome 2.5.14。

## 启动只读演示

在项目根目录的 PowerShell 中执行：

```powershell
# 仅为当前终端补充 Bun 的路径，不修改永久 PATH。
$env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"

# 首次安装或清理 node_modules 后执行。
bun install --frozen-lockfile

# 日常预览只需要这条启动命令。
bun run dev:demo
```

实际已成功启动的演示地址：<http://127.0.0.1:5174/>。

演示账号：`demo@example.com`；演示口令：`mind-island-demo`。这是虚构账号，不是后端账号，也不是生产凭据。保留原有登录表单，不自动绕过登录。

可预览 Dashboard、Items、Admin、Settings，以及原有表单、对话框和主题切换界面。演示用户拥有虚构的管理员标记，以便查看 Admin 页面，不代表真实权限验证已经通过。

这是**只读预览**：修改、删除、注册、密码重置和邮件操作不提供成功结果；尝试提交会返回明确的本地演示提示。演示数据为代码中的固定样本，不保存到数据库。刷新保留浏览器中的演示登录状态，退出登录会清除该状态。

停止服务：在运行命令的终端按 `Ctrl+C`。5174 被占用时命令会退出，不会悄悄切换端口。

## 普通开发模式与后端边界

```powershell
# 项目根目录，已在当前终端配置 Bun PATH 后执行。
bun run dev
```

本轮验证普通模式时额外传入 `--host 127.0.0.1 --port 5173 --strictPort`，实际地址为 <http://127.0.0.1:5173/>。默认 `bun run dev` 使用 Vite 原有的 localhost 设置。

普通模式保留 `frontend/.env` 中的后端地址配置，且不启用 Mock。登录页能够独立渲染，访问受保护页面会转到登录页；实际登录需要请求 `/api/v1/login/access-token`，用户资料、用户列表和条目列表同样依赖后端。

本轮实际观察到普通模式登录请求报 `net::ERR_CONNECTION_REFUSED`，请求目标是配置中的本机 8000 端口。这是**API 不可用**，不是 TypeScript 编译、Vite 启动或页面渲染失败。没有启动后端去绕过此限制。

## 演示模式的隔离方式

- 新增根目录和 frontend 的 `dev:demo` 脚本；原有 `dev` 命令保持不变。
- 仅显式使用 Vite `demo` mode 时加载 `frontend/.env.demo`，设置 `VITE_DEMO_MODE=true` 和独立 API 前缀。
- `main.tsx` 仅在 `import.meta.env.DEV` 且演示标志为 true 时动态加载 `src/dev/demo-api.ts`，并配置生成客户端的 Axios adapter。
- Mock 仅作用于该 API 客户端；不修改全局 fetch / Axios，不修改自动生成的 API 客户端，不启动模拟服务进程。未知请求在浏览器中失败，不转发到真实 API。
- 演示模式使用 5174，普通模式使用 5173；浏览器按端口隔离 localStorage，避免演示登录覆盖普通模式登录。
- 演示页面顶部显示只读说明及演示凭据；普通模式不显示。标准构建经检查不包含演示 token、账号、提示条或 API 前缀。

## 实际验证结果

| 检查 | 结果 |
| --- | --- |
| 冻结锁文件安装 | 通过；426 个包；bun.lock / uv.lock 未改动 |
| 原始模板构建 | `tsc -p tsconfig.build.json && vite build` 通过 |
| 普通 Vite 服务 | 启动成功，HTTP 200，登录页可渲染 |
| 普通模式登录 | 失败，后端连接被拒绝；符合本轮不启动后端的条件 |
| 演示 Vite 服务 | 启动成功，使用独立的 5174 端口 |
| 演示登录与页面 | Edge 浏览器验证登录、Dashboard、Items、Admin、Settings 均成功 |
| 只读行为 | 尝试新增条目，显示不可保存的演示提示，列表未增加条目 |
| 浏览器网络 | 修正 Mock 配置后，演示页面未发出 API 网络请求 |
| 浏览器控制台 | 最终演示页面 0 errors / 0 warnings |
| 移动端 | 390×844 设置页预览通过，文档宽度为 390，无横向溢出 |
| 代码检查 | 5 个变更文件的 Biome 完整检查通过；全前端 72 个文件的只读 lint 检查通过 |
| 构建隔离 | 标准构建产物检查未发现演示账号、token、提示条或 Mock 前缀 |

初次 Biome 检查发现 Windows CRLF 与格式器 LF 要求不符，已只格式化本轮涉及的前端文件。首次演示登录曾因生成客户端覆盖 Axios 默认 adapter 而请求到 Vite 并返回 404，已改为通过客户端 `setConfig` 注入 adapter，随后重新验证登录和各页成功。

最终再次执行冻结安装，输出 `no changes`；再次构建及上述代码检查均通过。普通模式页未显示演示提示，且未获得演示 token。两个 Vite 地址最终均返回 HTTP 200；8000 和 5432 端口未发现监听。Vite 提示可考虑更换 SWC 插件，这是非阻断建议，本轮未更换插件或依赖。

按模板原有配置，构建产物写入被 Git 忽略的 `backend/app/frontend/`；这只是静态文件输出，不会启动后端，也没有修改 backend 跟踪源码。

本轮没有运行依赖真实后端及邮件服务的原有完整 Playwright 套件；实际执行的是浏览器冒烟验证。后端测试与数据库测试不在本轮范围。

## 本轮文件与证据

- `package.json`、`frontend/package.json`：新增演示启动命令，没有修改依赖。
- `frontend/.env.demo`、`frontend/src/dev/demo-api.ts`：显式开发配置及只读虚构响应。
- `frontend/src/main.tsx`、`frontend/src/vite-env.d.ts`：开发模式加载和环境类型。
- `frontend/src/routes/__root.tsx`：仅演示模式显示说明条。
- `frontend/README.md`、`INITIALIZATION.md`：补充入口并保留首轮历史。
- 浏览器截图：桌面条目页（历史本机验证产物，未纳入仓库）、移动设置页（历史本机验证产物，未纳入仓库）。

Playwright CLI 仅用于本轮验证，没有加入项目依赖；截图和浏览器记录已通过本地 `.git/info/exclude` 排除，不改变仓库共享忽略规则。后端源码、模型、迁移及已有功能均保留，未加入 3D、AI 或新的产品业务页面。
