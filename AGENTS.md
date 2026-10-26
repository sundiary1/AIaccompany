# Mind Island development rules

Read `docs/PROJECT_CONTEXT.md` first, then `docs/DEVELOPMENT.md`. Historical reports
in `docs/history/` describe past states and are not the current setup guide.

- Preserve existing 3D models, animation, chat, history, and memory behavior.
- The local demo uses `backend/demo_ai`; it does not require Docker or PostgreSQL.
- Keep provider credentials in server-only `.env.local`; never use `VITE_*` secrets.
- Do not log message bodies, persist temporary chat, or enable memory by default.
- Do not make paid model calls for routine tests. Use isolated SQLite and mocks.
- Keep SQLite, snapshots, credentials, generated builds, caches, and raw browser
  recordings out of Git. Run `python scripts/check_repository.py --staged` before
  committing. Never rewrite shared Git history or force-push without authorization.
- Use parameterized SQL, bounded requests, explicit errors, and separate provider,
  data access, and UI responsibilities. Preserve loopback/Host/Origin protections.
- Prefer scoped changes. Lint without automatic unsafe fixes; run appropriate tests.
- Frontend: `bun run --filter frontend check:demo` and
  `bun run --filter frontend build`.
- Backend (from `backend`, with the demo environment active):
  `python -m unittest discover -s demo_ai/tests -v`,
  `python -m ruff check --target-version py313 demo_ai`, and
  `python -m ruff format --check --target-version py313 demo_ai`.
- Preserve `LICENSE` and upstream attribution. Do not add production deployment
  automation or unrelated features during maintenance.

## Global UI and visual consistency

以下规则适用于所有后续版本。新增功能是在已有 Mind Island 设计系统中扩展，而不是重新设计一个独立产品。

1. 开发前检查当前首页、已完成模块、全局样式、主题变量与通用组件，以仓库最新实现为唯一视觉基准；历史截图和旧报告不替代当前代码。
2. 沿用现有配色、字体、圆角、间距、阴影、图标、动效及交互习惯，不自行设计独立风格。
3. 优先使用项目当前安装版本的 Animal Island UI，沿用既有封装方式，不重复造轮子，不擅自升级组件库。
4. 优先复用已有导航、卡片、按钮、弹窗、加载状态与页面容器；先检查 `frontend/src/components/IslandUI/`、`frontend/src/index.css` 和当前模块实现。图标优先复用既有配套图标导出。
5. 保留已完成的视觉美化，仅在当前任务明确范围内修改，不进行无关的首页调整或全局重构。
6. 新增岛屿的材质、色彩、灯光、镜头与整体 3D 表现应与现有群岛协调，不擅自覆盖既有源资产。
7. 跨页面的切换、返回导航、加载动画、悬停反馈和移动端布局遵循现有规范，复用共享组件保持一致。
8. 涉及界面或视觉的开发完成后提供桌面端和移动端实际截图，对照现有页面验收，先修正明显差异；截图不得包含真实敏感聊天内容，验证优先使用隔离 Mock 数据。
