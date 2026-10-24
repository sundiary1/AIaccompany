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
