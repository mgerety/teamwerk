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
echo "The Team Lead will start automatically -- reading your PRD and kicking off the workflow."
echo "Attach to observe or interact at any time."
echo ""
echo "tmux cheatsheet:"
echo "  Detach (keep running):  Ctrl+B then D"
echo "  Reattach:               tmux attach -t $SESSION_NAME"
echo "  Kill:                   tmux kill-session -t $SESSION_NAME"
echo ""

if [ "$NO_INTERACTIVE" = false ] && [ -t 0 ]; then
  echo "Press Enter to launch..."
  read -r
fi

tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# --- Team Lead auto-start prompt ---
# The claude CLI accepts a positional prompt and --append-system-prompt.
# We use both so the Team Lead starts working immediately instead of sitting idle.
# NOTE: Prompt strings must not contain double quotes, backslashes, or dollar signs.
TEAM_SYSTEM="You are the Team Lead for a Teamwerk agent team. Use the team-lead skill for your full role definition and workflow. You coordinate the team -- you do not write implementation code yourself."

TEAM_PROMPT="Use the team-lead skill. Begin Phase 1: Read docs/prd.md, read docs/acceptance-criteria.md, check for teamwerk-config.yml, and read CLAUDE.md if present. Then plan the work breakdown and spawn your team."

tmux new-session -d -s "$SESSION_NAME" -c "$PROJECT_PATH" \
  "unset CLAUDECODE && export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 && claude --dangerously-skip-permissions --append-system-prompt \"$TEAM_SYSTEM\" \"$TEAM_PROMPT\""

# Only attach if we have a real terminal (TTY). When launched from Claude Code
# or other non-interactive contexts, just report success and show the attach command.
if [ -t 0 ] && [ -t 1 ]; then
  tmux attach-session -t "$SESSION_NAME"
else
  echo "✅ tmux session '$SESSION_NAME' is running. Team Lead is starting automatically."
  echo ""
  echo "To observe progress, open a terminal and run:"
  echo "  tmux attach -t $SESSION_NAME"
fi
