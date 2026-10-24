> 历史交付记录；当前启动与约定见 [开发指南](../DEVELOPMENT.md) 和 [项目上下文](../PROJECT_CONTEXT.md)。`<PROJECT_ROOT>` 表示项目根目录。

# Mind Island Demo V0.4：本机历史对话

后续 V0.5 已在保留本轮历史的基础上迁移到 schema v2，当前记忆功能与验证见 [MEMORY_DEMO_V05.md](MEMORY_DEMO_V05.md)。以下为 V0.4 当时的交付记录。

2026-10-24。已在 V0.3 上增加 SQLite 历史、会话管理、临时聊天与幂等重试。保留原 Git 工作区改动，没有重建聊天、模型或管理后台，没有新增依赖。

前端：<http://127.0.0.1:5174/island-preview>。交付时已恢复 `backend/demo_ai/.env.local` 中原有的 DeepSeek 真实配置；本轮增量测试全部使用 Mock Provider，真实 AI 请求为 **0**。

## 数据实际位置与启动

实际数据库：

```text
<PROJECT_ROOT>\backend\demo_ai\data\mind_island_demo.sqlite3
```

运行时检查：SQLite **3.50.4**，schema version **1**，文件 **40960 bytes**，`PRAGMA integrity_check` 返回 `ok`。默认正式演示库目前没有测试会话；测试数据位于隔离的 `output/playwright/history-v04-qa.sqlite3`，没有复制进默认数据库。

数据库、WAL/SHM、进程锁和服务端密钥均被 Git 忽略。本机库是普通 SQLite 文件，尚未加密，应保留在当前用户可控的目录中。没有 PostgreSQL、Docker 或正式用户系统。

终端一，从项目根目录启动代理：

```powershell
Set-Location backend
.\.venv-demo\Scripts\python.exe -m demo_ai
```

终端二，从项目根目录启动前端：

```powershell
& "$env:USERPROFILE\.bun\bin\bun.exe" run dev:demo
```

API 参数仍填写在 `backend/demo_ai/.env.local`；密钥未移动、未打印、未写入前端。可选的服务端变量 `DEMO_DATABASE_PATH` 用于指定独立测试库；默认无需填写。当前代理固定监听 `127.0.0.1:8001`，沿用 Host、Origin、来源地址校验。不要使用同一库启动多个代理进程。

测试和格式检查，从 `backend`：

```powershell
.\.venv-demo\Scripts\python.exe -m unittest discover -s demo_ai/tests -v
.\.venv-demo\Scripts\ruff.exe check --target-version py313 demo_ai
.\.venv-demo\Scripts\ruff.exe format --check --target-version py313 demo_ai
```

前端构建从 `frontend` 执行 `bun run build`，包含 TypeScript 检查。既有 V0.3 环境与依赖说明仍见 `AI_DEMO_V03.md`。

## 表、约束与索引

`conversations`：

| 字段 | 含义 |
| --- | --- |
| id | UUID 文本主键 |
| title | 会话标题，默认首条用户消息去除多余空白后前 20 字符；不调用模型 |
| created_at / updated_at | UTC ISO 8601，带 Z |
| last_message_at | 最近消息时间；新建空会话为 NULL |
| title_is_custom | 是否手动命名，避免自动标题覆盖用户修改 |

`messages`：

| 字段 | 含义 |
| --- | --- |
| id | UUID 文本主键 |
| conversation_id | 外键，`ON DELETE CASCADE` |
| role / content | user 或 assistant，消息正文 |
| status | pending / completed / failed / cancelled |
| created_at | UTC ISO 8601，带 Z |
| request_id | 稳定回合标识；用户消息 ID 与它相同 |
| sequence | 会话内递增顺序，避免仅靠时间排序 |
| attempt | 回复尝试版本，防止旧请求覆盖新重试 |
| is_safety | 保留安全响应标记 |
| finish_reason / error_code | 完成原因或预定义错误代码，不存底层异常详情 |

约束及索引：

- UUID 主键；`UNIQUE(conversation_id, sequence)`、`UNIQUE(request_id, role)`。
- `conversations_recent`：`COALESCE(last_message_at, created_at) DESC, updated_at DESC, id`。
- `messages_ordered`：`(conversation_id, sequence)`。
- `one_pending_reply`：同一会话只允许一条 pending assistant 消息的部分唯一索引。
- role/status CHECK；用户消息必须 completed；completed 内容不能为空。

完整实际 DDL 已导出到 `output/playwright/history-v04-schema.sql`。初始化使用事务及 `PRAGMA user_version`：首次创建 v1，重复初始化不重建表，不覆盖已有数据；高于当前版本的数据库会被拒绝，不能通过删库降级。未来增加显式 v1→v2 迁移，事务成功后才提升版本号。

## 数据一致性

1. 用户与 assistant pending 占位记录在同一事务创建。请求 ID 相同且正文一致时复用原记录；正文不一致返回冲突。
2. assistant ID 由 request ID 确定，失败/取消重试只递增 attempt，消息 ID 和行数保持稳定。
3. 已完成请求重发时直接回放数据库文本，不重复调用模型。旧失败回合之后已有新消息时，拒绝回到旧位置重试，避免顺序混乱。
4. 仅完整、有效并成功提交数据库的回复标记 completed，随后才发送 SSE done。保存失败发送明确错误，不显示成功。
5. 取消、断网、超时和上游失败保留相应状态及可取得的部分文本，不作为以后上下文。客户端收到完成前断开，但数据库已经提交时，重试可回放完整回复。
6. 服务端从 SQLite 读取最近最多 6 个完整回合、10000 字符；不接受持久化请求中的客户端 history。临时聊天仍使用原有有限前端上下文。
7. 删除/清空正在生成的会话由 API 拒绝；本页面会先取消自己的生成并等待状态收敛，再执行已确认的删除。其他窗口仍在生成时会返回明确提示。
8. SQLite 使用 WAL、外键、FULL synchronous、1 秒 busy timeout 和短 `BEGIN IMMEDIATE` 写事务；同步磁盘操作在线程池执行。
9. 回复收尾写入受取消屏蔽保护；写盘暂时失败时保留恢复队列并重试为取消状态。进程重启后，遗留 pending 会被标为 cancelled，绝不补成 completed。
10. OS 进程锁防止另一代理启动时误恢复仍在生成的记录。删除提交后执行尽力而为的 WAL checkpoint，并开启 secure_delete；这是逻辑删除与常规清理，不保证清除系统备份或存储介质上的所有历史副本。

## API

所有接口共用本机访问保护、输入校验、错误脱敏和 no-store 响应。

| 方法与路径 | 行为 |
| --- | --- |
| GET `/api/demo/conversations?limit=100&offset=0` | 最近消息时间倒序；界面支持继续加载 |
| POST `/api/demo/conversations` | 新建；可传稳定 UUID id 以重试创建，title 可选 |
| GET `/api/demo/conversations/{id}/messages` | 完整消息与会话元信息，按 sequence 排序 |
| PATCH `/api/demo/conversations/{id}` | 修改标题，最长 80 字符 |
| DELETE `/api/demo/conversations/{id}` | 删除会话及级联消息，204 |
| DELETE `/api/demo/conversations/{id}/messages` | 保留会话、清空消息；兼容原清空按钮，204 |

`POST /api/demo/chat/stream` 保持原 SSE 事件，新增：

```json
{
  "message": "当前消息",
  "conversation_id": "会话 UUID",
  "request_id": "稳定的用户消息 UUID",
  "temporary": false
}
```

meta 增加消息 ID、会话 ID 和 user_saved；done 增加 persisted，重放时包含 replayed。没有 conversation_id 的旧式请求仍作为临时聊天兼容。system 提示词、供应商 URL、模型配置不能由客户端指定。

## 界面与临时聊天

历史按钮在原聊天面板内展开抽屉；桌面沿用右侧 420px 面板，手机沿用底部面板。支持新建、选择、重命名、删除确认、清空确认与独立滚动。数据存放位置和“不是长期记忆”均在 UI 中说明。

点击临时聊天后使用独立的页面内状态，不向 SQLite 写消息，也不向 localStorage/IndexedDB 写正文。关闭或刷新后清除临时消息；返回普通聊天重新从服务器读取，不混入临时上下文。临时聊天仍经过相同的人设、长度和风险检查。

失败请求的用户输入保留在当前消息列表中，并明确提示未确认保存，可使用原 request ID 重试。未成功提交到服务器的消息没有永久副本，若此时直接离开/刷新页面，不能保证恢复；页面不会假装它们已保存。

原 GLB、相机、光照与角色动画代码保持不变，仅把页面关闭操作接入会话清理。Greeting/Responding/Idle 和减少动态设置沿用原系统。

## 文件清单

新增后端：

- `backend/demo_ai/database.py`
- `backend/demo_ai/repositories/__init__.py`、`conversation_repository.py`
- `backend/demo_ai/routes/__init__.py`、`conversations.py`
- `backend/demo_ai/chat_routes.py`、`streaming.py`：分离原流式路由和通用响应，增加持久化收尾
- `backend/demo_ai/tests/test_history.py`

修改后端：`main.py`、`models.py`、`config.py`、`.env.example`、`tests/test_chat.py`。既有测试改为使用隔离数据库；供应商适配和人设未更改。

新增前端 `frontend/src/components/Chat/`：`conversation-api.ts`、`ConversationDrawer.tsx`、`ConversationList.tsx`、`ConversationItem.tsx`、`ConversationEmptyState.tsx`、`DeleteConversationDialog.tsx`。

修改同目录：`useCompanionChat.ts`、`chat-api.ts`、`ChatPanel.tsx`、`ChatComposer.tsx`、`ChatMessage.tsx`、`chat.module.css`；以及 `IslandPreviewPage.tsx`、`frontend/vite.config.ts`、`.gitignore`、开发记录及本说明。

V0.3 快照在 `output/snapshots/mind-island-v03.zip`：307 文件、14801982 bytes，排除密钥、运行环境、生成构建和 Git 数据。此前未提交的改动均保留，没有执行提交或推送。没有修改模板 PostgreSQL 模型或迁移，没有新增 npm/Python 依赖。

## 实际测试

| 检查 | 结果 |
| --- | --- |
| 后端自动化 | **41 项通过**，含原 17 项与新增 24 项，最后一次约 14.8 秒 |
| SQLite / API | 创建、保存、列表顺序、恢复、标题、参数化 SQL、级联删除、清空、版本和完整性通过 |
| 幂等与并发 | 已完成重发不再调用 Provider；失败重试保持 ID/行数；相同 ID 不同正文冲突；同会话并发及生成中删除拒绝 |
| 中断与异常 | ASGI disconnect 保存 cancelled 部分文本；重启恢复 pending；保存失败无 done；锁冲突和不可写异常脱敏 |
| 数据安全 | 新 API 继承 Host/Origin/本机限制；未来 schema 不覆盖；第二代理不能恢复活跃记录；临时内容不出现在 SQLite 字节中 |
| 桌面浏览器 | 刷新恢复、切换、新建、重命名、删除确认及取消删除通过；失败输入保持可见；重试没有重复记录 |
| 手机浏览器 | 360×732 触摸模拟，点猫、恢复、删除当前会话、刷新中断生成通过；360×430 短视口输入与重命名可用 |
| 临时聊天 | 与普通聊天隔离；关闭与刷新均清除；SQLite 记录不变；浏览器存储无临时正文 |
| 前端错误 | 历史 503 有提示且仍可用临时聊天；save_failed 回复为 error，未冒充 completed |
| 前端检查 | TypeScript / Vite 构建通过；17 个相关文件 Biome check、全前端 93 文件 lint 通过 |
| 后端规范 | Ruff check / format check 通过 |
| 密钥与模型 | 142 个前端源码/构建文件扫描无真实密钥；数据库和密钥 Git 忽略通过；两个 GLB 及前端副本哈希保持 V0.3 一致 |

浏览器、数据库测试均使用明确标注的 Mock，不额外消费真实 API。原模板依赖 PostgreSQL 的整套测试未运行。

测试修复了初次 TS 的泛型空响应类型问题、finally 控制流规则和 CSS 选择器顺序提示，随后重新构建、检查通过。故障注入产生预期网络错误；没有把它们当作正常运行错误忽略。

本机证据在 `output/playwright/`：

- `history-v04-tests.log`、`history-v04-build.log`、`history-v04-schema.sql`
- `verify-history-v04.js`、`verify-history-v04-mobile.js`、`verify-history-v04-errors.js`
- `history-v04-desktop-chat.png`、`history-v04-desktop-history.png`
- `history-v04-mobile-chat.png`、`history-v04-mobile-history.png`、`history-v04-mobile-delete.png`
- `history-v04-save-error.png`

## 限制与后续建议

- 当前仍为单机单用户、未加密的本机 SQLite；不适合直接暴露给公网或多个用户。
- V0.3 仅存在浏览器内存中的旧消息不自动导入，已经刷新丢失的内容无法补录；新普通对话从 V0.4 起保存。
- 手机测试为浏览器模拟，实体手机软键盘、后台功耗和长会话性能未验证。完整消息读取尚无分页/虚拟滚动，超长会话可在后续单独优化。
- 进程在生成中崩溃时，用户消息和取消状态可恢复，但内存中尚未写盘的部分回复可能丢失；不会将其当成完整上下文。
- 既有 3D chunk 体积警告仍在：约 1029.97 KB，gzip 278.74 KB；Three.js Clock 与 Starlette 测试兼容层仍有原有弃用提示。
- 历史是原始对话记录，不等同长期记忆。未来需先设计明确授权、来源追溯、查看/撤回/删除及独立生命周期，再考虑提取记忆；本轮未建立任何语义记忆或训练流程。

实现依据：[Python sqlite3 文档](https://docs.python.org/3.13/library/sqlite3.html)、[SQLite PRAGMA](https://www.sqlite.org/pragma.html)、[SQLite WAL](https://www.sqlite.org/wal.html)。

Demo V0.4 到此停止，等待下一步指令。
