#!/bin/bash
# Teamwerk — Agent Team Launch
#
# Launches Claude Code with Agent Teams in a tmux session.
#
# Usage:
#   ./scripts/launch-team.sh                          # Use current directory
#   ./scripts/launch-team.sh /path/to/project         # Specify project path
#   ./scripts/launch-team.sh /path/to/project myname  # Custom session name
#   ./scripts/launch-team.sh --no-interactive          # Skip "Press Enter" prompt

set -euo pipefail

# --- Parse arguments ---
NO_INTERACTIVE=false
PROJECT_PATH=""
SESSION_NAME=""

for arg in "$@"; do
  case "$arg" in
    --no-interactive)
      NO_INTERACTIVE=true
      ;;
    *)
      if [ -z "$PROJECT_PATH" ]; then
        PROJECT_PATH="$arg"
      elif [ -z "$SESSION_NAME" ]; then
        SESSION_NAME="$arg"
      fi
      ;;
  esac
done

# Default project path: current directory
if [ -z "$PROJECT_PATH" ]; then
  PROJECT_PATH="$(pwd)"
fi

# Resolve to absolute path
PROJECT_PATH="$(cd "$PROJECT_PATH" 2>/dev/null && pwd)" || {
  echo "Error: Directory not found: $PROJECT_PATH"
  exit 1
}

# Default session name: project directory name (sanitized for tmux)
if [ -z "$SESSION_NAME" ]; then
  SESSION_NAME="$(basename "$PROJECT_PATH" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')"
fi

# --- Preflight checks ---
command -v tmux >/dev/null 2>&1 || { echo "Error: tmux not installed. Run: brew install tmux (macOS) or apt install tmux (Linux)"; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "Error: claude CLI not found"; exit 1; }

# Check if project is initialized
if [ ! -f "$PROJECT_PATH/docs/prd.md" ] && [ ! -f "$PROJECT_PATH/docs/acceptance-criteria.md" ]; then
  echo "Warning: Project not initialized. Run /init first to generate PRD and acceptance criteria."
  echo "Continuing anyway, but the Team Lead may not have enough context."
  echo ""
fi

echo "=== Teamwerk — Agent Team Launch ==="
echo ""
echo "Project:  $PROJECT_PATH"
echo "Session:  $SESSION_NAME"
echo ""
echo "Once inside, instruct Claude to read your team prompt and begin."
echo ""
echo "tmux cheatsheet:"
echo "  Detach (keep running):  Ctrl+B then D"
echo "  Reattach:               tmux attach -t $SESSION_NAME"
echo "  Kill:                   tmux kill-session -t $SESSION_NAME"
echo ""

if [ "$NO_INTERACTIVE" = false ]; then
  echo "Press Enter to launch..."
  read -r
fi

tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

tmux new-session -d -s "$SESSION_NAME" -c "$PROJECT_PATH" \
  "export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 && claude --dangerously-skip-permissions"

tmux attach-session -t "$SESSION_NAME"
