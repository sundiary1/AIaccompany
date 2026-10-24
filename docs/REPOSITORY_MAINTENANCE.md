# 项目整理与版本管理

2026-10-25。整理基于已完成的 Demo V0.5，不变更聊天、记忆或 3D 功能。

## 本次整理

- 根 README 改为 Mind Island 的当前启动入口。
- `PROJECT_CONTEXT.md` 压缩开发历史；`DEVELOPMENT.md` 统一开发、配置和验证方式。
- 七份旧交付文档移动至 `docs/history/`，修正链接；保留四张不含真实聊天的 Mock 截图。
- 保留全部 Blender 工程、脚本、导出及渲染；运行模型副本继续放在前端静态目录。
- 删除 198 个过时快照、调试产物、缓存或生成文件，合计 36339562 bytes，约 34.7 MiB。
- 移除 18 个上游组织/发行/部署相关 GitHub 自动化文件，以及 4 个指向不存在虚拟环境的技能软链接。
- 原模板应用、数据库迁移、Compose、邮件包、MIT 许可证和上游历史保留。
- 根与前端 `.env` 退出版本跟踪，保留本机文件及安全的 `.env.example`；真实代理配置和 SQLite 从未加入暂存。
- 新增提交前私密文件/凭证检查及 4 项单元测试。前端 lint 默认只检查，显式 fix 也不使用 unsafe。
- 新 Demo CI：仓库检查、Linux/Windows Mock 后端测试、前端 lint 与构建；无部署、无真实模型请求。CI 状态以 GitHub Actions 的实际结果为准。

## 版本库

项目仓库：<https://github.com/sundiary1/AIaccompany>，主分支 `main`，基线标签 `demo-v0.5.0`。`upstream` 保留官方模板；未强推或重写上游提交。

提交包含源码、锁文件、开发说明、测试、必要 3D 资产及演示截图；不包含环境密钥、用户聊天/记忆数据库、开发备份、依赖目录或编译输出。

保留的本机稳定备份位于被忽略的 `output/snapshots/`。清理明细与本次日志位于 `output/maintenance/`，均不上传。没有删除应用中的历史对话或长期记忆。

## 本机验证

- 后端 73 项测试通过；Ruff check / format 通过。
- 仓库边界 4 项测试通过；暂存内容扫描未发现凭证或私密/生成路径。
- 前端 31 个相关文件 Biome 检查通过；TypeScript + Vite 构建通过。
- `bun install --frozen-lockfile --ignore-scripts` 无依赖变化。
- Git diff 空白检查及当前文档链接检查通过。
- 保留原有 bundle 大小提示；本轮真实模型 API 请求 0 次。

源码备份与 SQLite 仍未加密；此仓库管理不代表生产级隐私保护。
