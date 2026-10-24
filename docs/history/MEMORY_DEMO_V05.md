> 历史交付记录；当前启动与约定见 [开发指南](../DEVELOPMENT.md) 和 [项目上下文](../PROJECT_CONTEXT.md)。`<PROJECT_ROOT>` 表示项目根目录。

# Mind Island Demo V0.5：授权自动长期记忆

2026-10-25。本轮在 V0.4 上增加记忆能力，没有新增依赖，没有修改 GLB、岛屿场景、角色动作或原有管理后台。

实际页面：<http://127.0.0.1:5174/island-preview>。打开聊天 → **记忆信箱**。自动提取和使用已有记忆默认均关闭，首次开启需要阅读说明并勾选授权。只处理开启后新完成的普通聊天，不扫描历史。自动提取与使用可以分别关闭。

交付时已恢复原有服务端 DeepSeek 配置，代理状态为 `live`；本轮真实聊天/提取 API 请求均为 **0 次**。浏览器截图采用明确标注的 Mock 模式和隔离测试库，不混入原有聊天数据。真实供应商的语义提取效果尚未进行付费验证。

## 启动与配置

从项目根目录分别打开两个 PowerShell 终端：

```powershell
Set-Location backend
.\.venv-demo\Scripts\python.exe -m demo_ai
```

```powershell
# Bun 已安装但不在当前 PATH 时，仅在此终端补充路径
$env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
bun run dev:demo
```

代理固定监听 `127.0.0.1:8001`，单进程；前端监听 `127.0.0.1:5174`。沿用 loopback、Host、Origin、跨站请求限制和错误脱敏。

密钥和供应商配置仍填写在 **`backend/demo_ai/.env.local`**，没有迁移到前端。本轮未修改真实密钥文件。可参照 `backend/demo_ai/.env.example` 添加可选配置并重启代理：

```dotenv
# 留空时复用 AI_MODEL，以及原有 AI_BASE_URL / AI_API_KEY
MEMORY_MODEL=
MEMORY_MAX_OUTPUT_TOKENS=768
MEMORY_TIMEOUT_SECONDS=20
MEMORY_DAILY_CALL_LIMIT=20
MEMORY_MAX_ATTEMPTS=2
```

这些配置不会替代用户授权。`AI_MODE=mock` 时聊天和提取均使用本地模拟，不调用供应商。

## 修改文件

新增服务端文件：

- `backend/demo_ai/memory_schema.py`：v2 增量表结构。
- `backend/demo_ai/memory_models.py`：API 与提取 JSON 的校验模型。
- `backend/demo_ai/memory_rules.py`：证据、敏感内容、标准化与检索规则。
- `backend/demo_ai/repositories/memory_repository.py`：授权、记忆、来源、版本、持久任务、用量访问。
- `backend/demo_ai/memory_worker.py`：后台单任务处理、独立提取适配器及 Mock。
- `backend/demo_ai/prompts/memory_extraction.txt`：与陪伴人设分离的提取指令。
- `backend/demo_ai/routes/memories.py`：记忆管理、设置和任务状态接口。
- `backend/demo_ai/tests/test_memory.py`：32 项新增自动化测试。

修改服务端文件：`database.py`、`config.py`、`provider.py`、`main.py`、`chat_routes.py`、`repositories/conversation_repository.py`、`.env.example`、`tests/test_history.py`（版本断言）。均位于 `backend/demo_ai/`。

新增前端文件，均位于 `frontend/src/components/Chat/`：`MemoryMailbox.tsx`、`MemoryConsentDialog.tsx`、`MemoryEditor.tsx`、`memory-api.ts`、`useMemoryStatus.ts`。

修改前端文件：同目录 `ChatPanel.tsx`、`chat.module.css`、`chat-api.ts`、`useCompanionChat.ts`，以及 `frontend/vite.config.ts` 的两个本机代理前缀。文档更新本文件、`frontend/README.md` 和 V0.4 文档入口。未新增 npm/Python 包。

原工作区已有未提交改动全部保留。修改前源文件快照位于 `output/snapshots/mind-island-v04.zip`，SQLite 一致性备份位于 `output/snapshots/mind-island-v04.sqlite3`。备份与测试输出被 Git 忽略；SQLite 备份包含当时的聊天数据，应用中的删除操作不会删除这些手动开发备份。

## 数据库与迁移

实际数据库：

```text
<PROJECT_ROOT>\backend\demo_ai\data\mind_island_demo.sqlite3
```

SQLite 3.50.4；实际 `PRAGMA user_version=2`。迁移在事务内增加表，不覆盖 v1 的会话与消息；高于 v2 的数据库会拒绝打开。迁移前后原有 **2 个会话、4 条消息** 全字段序列化摘要一致。`integrity_check=ok`，`foreign_key_check` 无错误。主库文件检查时为 114688 bytes，WAL 模式下大小会变化。实际主库的 memories/jobs/calls 均为 0，两项记忆开关均为 0，未取得授权。

| 表 | 核心字段及用途 |
| --- | --- |
| `memories` | UUID、content、category、normalized、topic_key、phase、source_type、来源会话/消息、enabled、review_status、user_edited、sensitive、related_memory_id、revision、UTC 时间 |
| `memory_settings` | 单行授权：auto_extract、use_memories、consent_version、consented_at、auto_enabled_at、epoch、updated_at |
| `memory_jobs` | 关联 user/assistant/会话 UUID、epoch、状态、attempts、调用/Token 数、增改/待核对数、脱敏错误码、UTC 时间；user_message_id 唯一 |
| `memory_sources` | 每条记忆可关联多条真实用户消息，记录字面证据、标准化事实和时间；`(memory_id,message_id)` 联合主键 |
| `memory_versions` | 更新前内容及来源消息、时间；随记忆删除 |
| `memory_calls` | 仅记录 job UUID、attempt、时间、数值用量；不存正文；独立于聊天级联删除，以防删除聊天绕过每日费用上限 |

新增索引：`memories_selection(enabled,review_status,updated_at DESC)`、`memories_topic(topic_key,normalized)`、`memory_sources_message(message_id)`、`memory_jobs_queue(status,created_at)`。保留 v1 全部索引和唯一约束。

继续采用 WAL、外键、短写事务、1 秒锁等待、线程内磁盘访问及独占进程锁；参数化 SQL，不打印聊天正文。后台任务取消时等待当前短事务结束后再释放数据库。

## 提取、更新与检索

1. 普通用户消息提交时取得授权 epoch；AI 回复完成且成功保存后，同一事务内用 SAVEPOINT 插入唯一任务。排队失败不会回滚聊天，但 SSE 会带记忆警告，前端明确提示未确认新增。
2. 独立后台 worker 读取当前真实用户消息。源消息先经过服务端凭证、敏感、归因/假设规则及可支持语句筛查，再调用提取模型；不向提取器提供 AI 回复。
3. 提取输出必须通过 Pydantic JSON 校验；来源 UUID 必须匹配，证据必须是当前用户消息中的完整第一人称分句。服务端从字面证据生成规范事实，不直接保存模型自拟的事实文字。
4. MVP 自动接受明确形式的偏好、习惯、学习/工作目标、职业/城市和交流方式。一次性情绪、引用或猜测不自动保存。敏感经历需在“新增/编辑”中明确勾选主动保存；凭证、身份号码、系统指令仍拒绝保存。
5. 完全重复及简单同义表达（如雨天/下雨天）复用同一记忆，追加来源。明确更正同一主题、且版本未变化时可更新自动条目，保留旧版本和来源。例：正在准备研究生考试 → 已参加完研究生考试。
6. 不确定冲突进入“待核对”，关联旧条目；核对前两者均不进入检索。用户确认后停用旧条目。手动新增或编辑的内容不会被后台任务覆盖。
7. 普通聊天只检索获得全局授权、enabled、approved 且没有待核对冲突的条目；按中文二元词/词面匹配与交流偏好选择，最多 5 条、1000 字。当前明确表达优先。以带静态系统边界说明的 JSON 参考数据注入，不视为指令，不做心理诊断。

关闭任一授权开关、修改或删除记忆会使旧任务失效；任务提交前再次检查授权 epoch、来源消息及回复状态。删除聊天会级联删除任务/来源，不能被延迟任务恢复。多来源重复事实可保留其他真实来源；若删除的是新事实的唯一依据而仅剩过时来源，则转为待核对，不复活旧事实。

临时聊天绕过记忆授权读取、检索、任务排队及 SQLite 消息保存；前端隐藏信箱并停止记忆请求，不把临时正文存入 localStorage/IndexedDB。仍经过原有安全检查。

## 成本与故障恢复

- 每个完成回合只有一个持久任务。提取单次调用，不做供应商回退重试或失败自动重试。
- 默认每天最多 20 次真实提取尝试（UTC 日），人工重试也计入。调用前记账，失败仍计入；Mock 的真实调用数为 0。
- 单次用户输入沿用 2000 字上限；提取数据最多 5000 字符、已有参考最多 8 条；输出默认 768 tokens、超时 20 秒、候选最多 4 条，提示词建议最多 3 条。
- 默认每个任务最多 2 次尝试，失败后需用户在信箱手动重试。没有可提取信息时跳过模型调用或接受空数组。
- 进程重启后 pending 可恢复；running 改为 failed/interrupted，避免无法确定是否已计费的请求自动重放。任务异常不会破坏已保存的聊天。
- 保存返回的数字 Token 用量；取消/断网时供应商未返回的用量无法精确知道，调用次数仍已记账。未按供应商价格估算金额；本轮实际费用调用为 0。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET / POST | `/api/demo/memories` | 列出 / 手动新增 |
| PATCH / DELETE | `/api/demo/memories/{id}` | 编辑、启停、核对 / 单条删除 |
| DELETE | `/api/demo/memories/auto` | 删除所有自动来源记忆（包含手动编辑过的自动条目），保留手动新增 |
| GET / PATCH | `/api/demo/memory/settings` | 查询 / 更新授权与开关 |
| GET | `/api/demo/memory/status` | 最近任务、计次及 Token 用量 |
| POST | `/api/demo/memory/jobs/{id}/retry` | 有限、显式重试 |

沿用 `/api/demo/chat/stream` SSE；原字段保持兼容，done 增加 `memory_queued` / `memory_warning`。没有允许客户端指定系统 Prompt、模型供应商地址或候选记忆的入口。

## 实际验证结果

- **后端：73 项通过**（41 项原有回归 + 32 项记忆测试），使用临时 SQLite、MockTransport 和 Fake/Mock Extractor；没有真实网络模型调用。
- 覆盖默认未授权/不回扫、字面证据及伪造来源、情绪/敏感/引用过滤、去重、明确更新、冲突核对、手动保护、跨会话注入、禁用/删除/停止使用、临时隔离、多来源清理、延迟任务、取消/失败、幂等、原聊天并发、任务原子领取、后台不阻塞、超时、额度、重启与迁移、锁异常及来源/Host/Origin 校验。
- **TypeScript + Vite 构建通过**：`frontend` 中运行 `bun run build`。保留既有 3D bundle 超过 500 kB 提示，预览 chunk 约 1.04 MB / gzip 283 kB。
- **Ruff check / format --check 通过**：23 个 Demo Python 文件。
- **Biome check 通过**：本轮 10 个新增/修改的前端源码与配置文件。没有运行会改写整个模板的全量 unsafe lint。
- **浏览器：Edge/Chromium 实际渲染**，桌面 1440×1000；手机 390×844，同时测试 isMobile/hasTouch 的 tap 和 reduced-motion。信箱可滚动，无横向溢出；授权、新增、自动提取、刷新恢复、编辑、核对、单条/批量删除、暂停、停止使用、临时清除、来源展示和错误提示已验证。
- 浏览器注入一次 503 验证错误和重新载入；对应控制台 503 属于此测试。正常流程无 JavaScript 错误，仍有原有 `THREE.Clock` 弃用警告。未测试实体手机的软键盘行为。
- 既有两份 GLB 的 SHA-256 与开发前一致，实际加载均 200；岛屿/小屿继续显示，减少动态设置生效。没有改动画代码或按 token 重建模型。
- 扫描前端源码、静态资源和构建文本，未发现已配置密钥；密钥、SQLite/WAL/SHM 和备份的 Git ignore 验证通过。

自动化日志：`output/playwright/memory-v05-tests.log`、`memory-v05-build.log`；迁移和模型摘要：`memory-v05-verification.json`。浏览器操作脚本同目录 `memory-v05-*.cjs`，只允许 Mock 模式发送测试消息。

## 实际截图

- [桌面记忆信箱](../screenshots/memory-v05-desktop.png)
- [手机记忆信箱](../screenshots/memory-v05-mobile.png)
- [首次授权](../screenshots/memory-v05-consent.png)
- [冲突核对](../screenshots/memory-v05-conflict.png)
- 临时聊天（本机历史输出，未上传）
- 手机触摸与减少动态（本机历史输出，未上传）
- 手机岛屿原场景（本机历史输出，未上传）
- 可恢复的加载错误（本机历史输出，未上传）

## 已知限制

自动提取是保守的 MVP：有意只接受有限的第一人称稳定表达，复杂措辞可能漏存；“咖啡改成茶”等跨主题语义替换可能同时保留，需用户编辑。不确定信息不会仅凭模型 confidence 覆盖。没有向量检索、心理画像或自动扫描历史。

敏感/凭证筛查为本机规则防线，不能保证识别所有隐晦表达；手动敏感内容必须显式授权，日后如用于正式产品需进一步评估。数据库、开发备份未加密，单机单用户、无身份系统，不具备生产级隐私保护；用户已发给供应商的内容不能通过本机删除撤回。

关闭提取会停止后续任务并取消本机正在等待的提取；已经发出的上游请求可能仍被计费。删除后未来新的普通消息若再次明确提到该事实，且自动记忆仍开启，可生成新的记忆；不会重放已经完成的旧请求来恢复删除条目。

本轮未进行真实付费提取效果测试、实体手机软键盘测试或生产部署。没有继续开发语音、心理诊断、长期语义检索、其他岛屿或用户系统。
