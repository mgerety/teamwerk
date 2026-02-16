---
name: launch-team
description: Launch an agent team in tmux with Agent Teams enabled
user_invocable: true
---

Launch an agent team for the current project using tmux.

## Steps

1. **Check prerequisites.** Verify that `tmux` is installed by running `which tmux`. If it is not installed, tell the user to install it (`brew install tmux` on macOS, `apt install tmux` on Debian/Ubuntu) and stop.

2. **Determine the project directory.** Use the current working directory as the project path.

3. **Launch the team.** Run the launch script:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/launch-team.sh" "<project-path>"
   ```
   This script sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and starts a tmux session with the agent team.

4. **Explain next steps.** Tell the user:
   - The team is now running inside a tmux session.
   - Once inside tmux, the Team Lead skill will coordinate the other agents.
   - Each agent has a dedicated tmux pane so you can observe their work in parallel.

5. **Provide the tmux cheatsheet:**
   - Detach from the session: `Ctrl+B` then `D`
   - Reattach to the session: `tmux attach -t <session-name>`
   - Switch between panes: `Ctrl+B` then arrow keys
   - Kill the session when done: `tmux kill-session -t <session-name>`
