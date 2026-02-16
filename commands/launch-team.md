---
name: launch-team
description: Launch an agent team in tmux with Agent Teams enabled
user_invocable: true
---

Launch an agent team for the current project using tmux.

## Steps

1. **Check if project is initialized.** Look for `docs/prd.md` or `docs/acceptance-criteria.md` in the project directory.
   - If neither exists, tell the user: "This project hasn't been initialized yet. Run `/init` first to set up your PRD and acceptance criteria."
   - Stop and do not proceed until the user runs `/init`.

2. **Check prerequisites.** Verify that `tmux` is installed by running `which tmux`. If it is not installed:
   - On macOS: Ask "tmux is required. Want me to install it? (`brew install tmux`)"
   - On Linux: Ask "tmux is required. Want me to install it? (`sudo apt install tmux`)"
   - If user agrees, run the install command. If not, stop.

3. **Determine the project directory.** Use the current working directory as the project path.

4. **Launch the team.** Run the launch script:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/launch-team.sh" "<project-path>"
   ```
   This script sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and starts a tmux session with the agent team.

5. **Explain next steps.** Tell the user:
   - The team is now running inside a tmux session.
   - The Team Lead will read `docs/prd.md` and `docs/acceptance-criteria.md` to understand what to build.
   - The Team Lead will then spawn the other agents and coordinate the work.
   - Each agent has a dedicated tmux pane so you can observe their work in parallel.

6. **Provide the tmux cheatsheet:**
   - Detach from the session: `Ctrl+B` then `D`
   - Reattach to the session: `tmux attach -t <session-name>`
   - Switch between panes: `Ctrl+B` then arrow keys
   - Kill the session when done: `tmux kill-session -t <session-name>`
