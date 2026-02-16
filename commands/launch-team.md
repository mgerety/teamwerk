---
name: launch-team
description: Launch an agent team in tmux with Agent Teams enabled
user_invocable: true
---

Launch an agent team for the current project using tmux.

**Preferred method**: Run `teamwerk` from a regular terminal (installed by `/init`). This command exists as a fallback when running from within Claude Code, but launching from a terminal is the better experience.

## Steps

1. **Recommend the terminal approach.** Tell the user:
   - "The best way to launch is from a regular terminal: just run `teamwerk` in your project directory."
   - "If the `teamwerk` command isn't installed, run `/init` first — it will set it up."
   - Only proceed with the steps below if the user specifically wants to launch from within this Claude Code session.

2. **Check if project is initialized.** Look for `docs/prd.md` or `docs/acceptance-criteria.md` in the project directory.
   - If neither exists, tell the user: "This project hasn't been initialized yet. Run `/init` first to set up your PRD and acceptance criteria."
   - Stop and do not proceed until the user runs `/init`.

3. **Check prerequisites.** Verify that `tmux` is installed by running `which tmux`. If it is not installed:
   - On macOS: Ask "tmux is required. Want me to install it? (`brew install tmux`)"
   - On Linux: Ask "tmux is required. Want me to install it? (`sudo apt install tmux`)"
   - If user agrees, run the install command. If not, stop.

4. **Determine the project directory.** Use the current working directory as the project path.

5. **Launch the team.** Run the launch script:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/launch-team.sh" "<project-path>" --no-interactive
   ```
   This script sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and starts a tmux session with the agent team.

6. **Explain what's happening.** Tell the user:
   - The team has launched in a tmux session and the Team Lead is **already working**.
   - To observe progress, open a terminal and run: `tmux attach -t <session-name>`
   - The team runs autonomously -- no further instructions needed unless you want to intervene.

7. **Provide the tmux cheatsheet:**
   - Detach from the session: `Ctrl+B` then `D`
   - Reattach to the session: `tmux attach -t <session-name>`
   - Switch between panes: `Ctrl+B` then arrow keys
   - Kill the session when done: `tmux kill-session -t <session-name>`
