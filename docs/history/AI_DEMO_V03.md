> 历史交付记录；当前启动与约定见 [开发指南](../DEVELOPMENT.md) 和 [项目上下文](../PROJECT_CONTEXT.md)。`<PROJECT_ROOT>` 表示项目根目录。

# Mind Island Demo V0.3：真实 AI 陪伴

> Demo V0.4 已加入 SQLite 历史和临时聊天，当前行为及测试见 [HISTORY_DEMO_V04.md](HISTORY_DEMO_V04.md)。下文保留 V0.3 交付记录。

2026-10-24。已完成本机代理、页内流式聊天和角色联动；用户填写配置后，已通过真实 DeepSeek 两轮对话验证。

预览：<http://127.0.0.1:5174/island-preview>。前端和代理当前分别监听 `127.0.0.1:5174`、`127.0.0.1:8001`。

## API 填写位置

**`backend/demo_ai/.env.local`** 是唯一的本地服务端配置文件，已加入 Git 忽略。不要填写到前端环境变量，不要使用 `VITE_` 前缀，也不需要将密钥发到聊天中。

当前使用 `AI_MODE=live`、DeepSeek 官方 Chat Completions 基础地址 `https://api.deepseek.com` 和用户选择的 `deepseek-flash`。密钥已保留，不在此记录中展示。

通用模板见 [backend/demo_ai/.env.example](../../backend/demo_ai/.env.example)：

```dotenv
AI_MODE=live
AI_API_KEY="填写你的密钥"
AI_BASE_URL="填写供应商提供的兼容接口基础地址"
AI_MODEL="填写供应商实际支持的模型名称"
```

模板中的中文是填写说明，不是真实配置值。服务端会在基础地址后追加 `/chat/completions`，不要填写完整 endpoint。系统环境变量优先于本地文件。修改后在代理终端 Ctrl+C，再重新启动；关闭并重新打开聊天可刷新连接状态。

`AI_MODE=mock` 明确显示模拟回复，不调用真实供应商；`live` 配置错误时不会自动改成模拟。

| 可选配置 | 默认与行为 |
| --- | --- |
| `AI_STREAM_MODE` | `auto`：请求 SSE，也接受直接返回的 JSON；仅在明确拒绝 stream 参数时改为非流式重发一次 |
| `AI_STREAM_MODE=off` | 直接请求非流式；一次显示完整回复，不伪装成逐 token 输出 |
| `AI_STREAM_MODE=on` | 请求流式，不自动重发；兼容直接返回 JSON |
| `AI_TOKEN_PARAMETER` | `max_tokens`；可改为供应商支持的 `max_completion_tokens` |
| `AI_MAX_OUTPUT_TOKENS` | 512，允许 64–2048；另有 8000 字符硬上限 |
| `AI_REQUEST_TIMEOUT_SECONDS` | 总时限 45 秒，允许 5–90 秒；连接 8 秒、上游读等待 20 秒；浏览器另有 60 秒时限 |
| `AI_MAX_CONCURRENT` | 2，允许 1–4；本机另有每分钟 12 条请求的共享限流 |

DeepSeek 官方接口默认启用 thinking；适配层对 `api.deepseek.com` 显式关闭 thinking，避免简短陪伴回复耗尽小额输出预算。其他供应商不会收到这个专用参数。供应商协议调整仅涉及服务端 `provider.py`。

## 启动与依赖

模板原后端要求 Python 3.14，初始化依赖数据库。本轮使用现有 Python 3.13.14 创建 `backend/.venv-demo`，独立入口不导入 `app.main`，没有改动模板后端、数据库或迁移。

终端一，从项目根目录启动代理：

```powershell
Set-Location backend
.\.venv-demo\Scripts\python.exe -m demo_ai
```

终端二，从项目根目录启动前端：

```powershell
& "$env:USERPROFILE\.bun\bin\bun.exe" run dev:demo
```

如果端口已占用，请检查现有服务终端。代理入口固定 loopback、单进程，关闭访问日志，不接受公网监听参数。

需要重建独立环境时，先具备 Python 3.13 和 uv，再从项目根目录执行：

```powershell
python -m venv backend/.venv-demo
& "$env:USERPROFILE\.local\bin\uv.exe" pip install --python backend/.venv-demo/Scripts/python.exe -r backend/demo_ai/requirements.lock.txt
# 仅首次创建，不覆盖已有密钥
if (-not (Test-Path backend/demo_ai/.env.local)) {
  Copy-Item backend/demo_ai/.env.example backend/demo_ai/.env.local
}
```

运行依赖为 FastAPI 0.141.1、HTTPX 0.28.1、Uvicorn 0.54.0、python-dotenv 1.2.4；传递依赖锁在 `requirements.lock.txt`。开发检查另用 Ruff 0.16.9，见 `requirements-dev.txt`。前端没有新增 npm 依赖。

## 新增和修改的文件

新增服务端目录 `backend/demo_ai/`：

- `__init__.py`、`__main__.py`：独立模块与启动入口。
- `main.py`：状态接口、`POST /api/demo/chat/stream`、SSE、取消、限流和 loopback/Host/Origin 校验。
- `config.py`、`.env.example`、本机忽略的 `.env.local`：服务端配置。
- `models.py`：消息角色、顺序和长度校验。
- `provider.py`：Chat Completions 适配、流式/JSON 处理及错误脱敏。
- `safety.py`、`prompts/xiaoyu.txt`：独立风险分流与服务端人设。
- `requirements.txt`、`requirements.lock.txt`、`requirements-dev.txt`：运行和检查依赖。
- `tests/test_chat.py`：17 项自动化测试，全部使用本地替身，不消费真实 API。

新增前端目录 `frontend/src/components/Chat/`：

- `ChatPanel.tsx`、`ChatMessage.tsx`、`ChatComposer.tsx`、`StreamingMessage.tsx`、`ChatError.tsx`、`EmptyChat.tsx`。
- `chat-api.ts`、`useCompanionChat.ts`、`chat.module.css`：流式解析、会话控制和样式。

修改：

- `frontend/vite.config.ts`：将 `/api/demo/chat` 代理到本机 8001。
- `frontend/.env.demo`：更新注释；模板账号仍使用虚构数据，聊天独立调用本机代理。
- `frontend/src/components/IslandPreview/IslandPreviewPage.tsx`：页内聊天、HTML 入口和角色联动。
- 同目录 `CompanionCat.tsx`：生成期间循环 Responding；`IslandScene.tsx`：更新无障碍说明。
- 同目录 `island-preview.module.css`：聊天展开时调整场景空间、手机底部布局及短横屏。
- `.gitignore`、`frontend/README.md`、`FRONTEND_DEVELOPMENT.md` 和本说明。

V0.2 本机文件快照：`output/snapshots/mind-island-v02.zip`，14,768,884 bytes，284 文件，排除环境密钥、Git 数据、运行环境及生成构建。没有提交或推送代码。之前轮次的工作区修改均保留。

没有修改两个 GLB；源文件及前端副本哈希仍一致：岛屿 `63a062c38a3fab38db8386d716b6236367c2f526f6869354bd9dd045cc5116dd`，小屿 `8e6aaeaecad4abaea50f2086fa2ee9c9d8b4a4b0448ac89a1e88b865e72e039b`。

## 行为与安全

点击小屿或 HTML 按钮在原页展开聊天，播放 Greeting；生成期间 Responding，完成、失败或取消后 Idle。桌面面板 420px；手机从底部展开，可扩大。消息区域独立滚动，VisualViewport 与安全区域参与布局；扩大时暂停背景动画。

Enter 发送、Shift+Enter 换行，中文组合输入不误发。支持停止、失败重试、清空和关闭重开；关闭会取消生成。消息只在页面组件内存中，刷新/离开页面丢失，不写入 localStorage、数据库或长期记忆。

前端只发送 `message`、`history`。最近最多 6 个完整回合、10000 字符，失败和取消的回复不进入上下文。服务端拒绝 system 角色及任意 URL、模型、提示词字段；当前用户消息最多 2000 字符，历史最多 12 条，总计 12000 字符，请求体最多 65536 bytes。

密钥仅用于服务端向供应商发起的 Authorization，不返回到浏览器，不跟随供应商重定向；不记录聊天正文或 HTTP 调试内容。错误只返回预定义说明，不透传上游错误正文、地址和密钥。人格与系统提示词仅在服务端注入。

独立本地风险规则检查中英文表达及近期用户上下文。命中时不调用供应商，不等待上游并发或额度，转为及时安全支持，引导联系当地急救、急诊或可信任的人；没有编造热线。这是 Demo 基础保护，不能保证识别所有风险，也不是临床评估。

## 实际验证结果

| 检查 | 结果 |
| --- | --- |
| 服务端自动化 | `python -m unittest discover -s demo_ai/tests -v`：17 项通过，约 9.4 秒 |
| 协议与错误 | SSE、JSON、一次非流式回退、角色与上下文、token 参数、认证/额度/限流/模型错误、超时和中断通过 |
| 限制与取消 | 非法输入/Host/Origin/远程来源拒绝；并发限制、安全响应优先；ASGI disconnect 在上游等待下一 token 时取消并释放槽通过 |
| 桌面 UI | 逐段显示、多轮、停止、失败重试、清空、IME、Shift+Enter、关闭重开、故障注入通过 |
| 角色 | 真正点猫打开并 Greeting；生成 Responding；取消、错误和完成后 Idle；流式更新前后模型 UUID 相同；减少动态设置生效 |
| 手机 | Edge 360×732 触摸模拟，发送/关闭/扩大通过；面板扩大至 720px；430px 短视口输入区仍可见 |
| 响应式 | 1440×1000、1024×768、768×1024、390×844、320×740、844×390 完整取景、无横向溢出；桌面场景不被面板遮挡 |
| 原功能回归 | 岛屿信息、演示登录、Dashboard、Items、Admin、Settings 通过 |
| TypeScript / Vite | `bun run build`（包含 tsc）通过，退出码 0 |
| 规范 | 改动前端 14 文件 Biome check、全前端 87 文件 lint、后端 Ruff check/format 通过 |
| 真实 API | 用户授权后，修正协议地址，2 条短消息成功；第一条约 1.03 秒，第二条约 0.70 秒；观察到逐段文本更新 |
| 真实多轮 | 第二条携带 2 条历史，模型正确回答上一轮测试词“青苔”；完成后 Idle；浏览器未携带供应商密钥 |

真实调用前先有 1 次协议地址不匹配的失败请求，未生成回复。原地址是 DeepSeek Anthropic 接口，已改为官方 Chat Completions 基础地址；密钥和模型名称未改。修正后仅发送上述 2 条测试消息，没有继续消耗 API。

测试中首次模拟文字断言未拼接 SSE 帧、首次 TS 检查发现 ES2020 不支持 replaceAll，均已修正并复验。短横屏场景顶部布局也已修正。原模板依赖数据库的整套测试未运行。

日志、浏览器检查脚本和截图保存在本机 Git 忽略的 `output/playwright/`。核心文件：`chat-v03-build.log`、`chat-v03-backend-tests.log`、`verify-chat-v03.js`、`verify-chat-v03-mobile.js`、`verify-chat-v03-framing.js`、`verify-chat-v03-live.js`。

截图：`chat-v03-desktop.png`、`chat-v03-mobile.png` 为模拟联调；`chat-v03-live-desktop.png` 为真实两轮对话；`chat-v03-live-mobile.png` 为手机布局的真实模式连接状态，没有额外发送手机 AI 请求。保存的测试文字不含私人心理信息或密钥。

## 已知限制

- 手机触摸和键盘布局为浏览器模拟，实体 Android/iPhone 软键盘、帧率及功耗仍待验证。
- 风险规则可能漏检或误报；真实调用只验证连接、流式和基本上下文，没有进行临床有效性或完整安全评估。
- 既有 3D 构建块警告仍在（约 1014.82 KB / gzip 274.54 KB），有 Three.js Clock 弃用提示；Starlette 测试客户端有 HTTPX 兼容层弃用提示。测试通过，正常页面无控制台错误；故障注入会产生预期网络错误。
- 仅供本机开发；生产构建成功不代表生产 AI 路由已配置。未实现长期记忆、语音、其他岛屿或用户系统。

参考：[FastAPI 流式响应](https://fastapi.tiangolo.com/advanced/custom-response/)、[HTTPX 异步流关闭](https://www.python-httpx.org/async/)、[DeepSeek 接口地址](https://api-docs.deepseek.com/guides/search_fetch)、[DeepSeek thinking 参数](https://api-docs.deepseek.com/api/create-chat-completion/)、[NIMH 及时安全支持原则](https://www.nimh.nih.gov/health/publications/5-action-steps-to-help-someone-having-thoughts-of-suicide)。
