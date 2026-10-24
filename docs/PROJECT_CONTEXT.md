# Mind Island 当前上下文

此文件压缩开发历史，供继续协作时快速读取；不代表应用中的用户长期记忆，也不包含聊天正文或密钥。

## 当前成果

版本 Demo V0.5。React + TypeScript + Vite；Three.js + R3F + Drei；独立 FastAPI 代理；Python 内置 SQLite。无需 Docker / PostgreSQL。

- `/island-preview`：既有 GLB 果冻岛、小屿、正交相机和柔和动画。
- 点击小屿在当前页面聊天；桌面右侧、手机底部面板。
- OpenAI-compatible SSE / 非流式回退；已适配 DeepSeek；取消、重试、异常与安全响应。
- schema v1 历史会话与消息；schema v2 记忆、授权、来源、版本、持久任务和调用计数。
- 自动记忆及使用开关默认关闭；只提取授权之后完成且已保存的普通回合。
- 临时聊天不保存正文，不读写长期记忆。

## 关键文件

- `backend/demo_ai/main.py`：独立应用、生命周期、loopback / Host / Origin 校验。
- `chat_routes.py`、`provider.py`：聊天流与供应商适配。
- `database.py`、`repositories/`：事务、会话、记忆和幂等。
- `memory_worker.py`、`memory_rules.py`：后台提取、证据与敏感规则。
- `prompts/`：陪伴人设与记忆提取指令分离。
- `frontend/src/components/Chat/`：聊天与记忆信箱，不需要重新创建。
- `frontend/src/components/IslandPreview/`：沿用角色状态，不按 token 重建模型。
- `assets/blender/`：保留 bpy、blend、GLB、角色四视图及验证报告。

## 不可破坏的边界

- API Key 仅在 `backend/demo_ai/.env.local`；不进前端、日志、Git。
- 默认数据库 `backend/demo_ai/data/mind_island_demo.sqlite3`；全部忽略。
- 临时聊天不调用记忆模块；普通上下文由服务端读取完整已完成回合。
- 稳定请求 ID；失败/取消不算完整回复；同会话并发受控。
- 记忆仅凭真实用户消息字面证据；敏感内容不可自动保存；手动编辑不得自动覆盖。
- 重复合并来源；明确更正保留版本；不确定冲突待核对，旧条目暂不注入。
- 删除聊天级联处理来源与任务；延迟任务必须重新校验 epoch / 消息存在性。
- 只把授权、enabled、approved 的相关记忆作为不可信参考，当前表达优先。
- 不做心理诊断、隐蔽长期记忆、向量服务、语音或其他岛屿，除非新任务授权。

## 费用与恢复

单 worker；每回合唯一任务；默认 20 秒 / 768 输出 tokens / 每 UTC 日 20 次调用。失败不自动重试，人工重试总尝试上限 2。重启恢复 pending；中断的 running 标为 failed，防止重复付费。提取失败不影响已保存聊天。取消后已发出的上游请求可能仍计费。

## 验证基线

V0.5 完成时：73 项后端 Mock 测试通过；TypeScript / Vite、Ruff、相关前端 Biome 通过；桌面与触摸模拟通过。真实 API 提取调用 0 次。SQLite v1→v2 保留原历史，GLB 未变。

保守规则可能漏掉复杂表达；SQLite/备份未加密；实体手机键盘与真实模型提取质量尚未系统验证。既有 3D bundle 约 1.04 MB，有 chunk 大小和 THREE.Clock 弃用提示。

## 当前版本管理约定

`origin` 指向 sundiary1/AIaccompany；`upstream` 保留官方模板。主分支 `main`。当前入口是根 README 和开发指南；旧交付记录位于 `docs/history/`，其中过时环境描述不可当作当前事实。
