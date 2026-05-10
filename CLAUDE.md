# CLAUDE.md

Project + deploy context lives in `AGENTS.md` so Codex and other agents read the same source of truth. Do not duplicate content here — edit `AGENTS.md` instead.

@./AGENTS.md

## Claude Code specifics

- `.claude/agents/prod-deploy-pilot.md` — invoke when shipping to production ("deploy", "push to prod", "ship it"). Walks a feature branch through pre-flight, PR, CI watch, merge, smoke test, and manual follow-ups for migrations / edge functions.
- `.githooks/` is activated by `git config core.hooksPath .githooks` (one-time per clone). On a fresh clone, run that before your first commit.
