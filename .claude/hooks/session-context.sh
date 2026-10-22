#!/usr/bin/env bash
# silvermind-project.github.io: SessionStart context (startup and after compaction), at most 10 lines (EG-M06).
set -u
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
branch=$(git branch --show-current 2>/dev/null)
dirty=$(git status --short 2>/dev/null | wc -l)
echo "[silvermind-project.github.io] branch ${branch:-?}, ${dirty// /} files changed or untracked."
echo "Gate: npm run docs:build (Node 24: nvm use). Public pages follow the documentation-writing skill."
echo "Guards: .claude/hooks/ (project) and ~/.claude/hooks/guard-machine.sh (machine). Override with ! if intended."
