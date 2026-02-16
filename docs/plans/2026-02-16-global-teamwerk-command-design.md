# Global `teamwerk` Command

## Problem

Launching a team from Claude Code is broken: Claude Code can't spawn a nested session (CLAUDECODE env var blocks it), and even when the tmux session is created in the background, the user has to leave Claude Code, open a terminal, and type a 70+ character path to the launch script. That's unacceptable.

## Design

### User Experience

From any terminal:
```
teamwerk                    # launch team for current directory
teamwerk ~/repos/MyProject  # launch team for a specific project
```

Creates the tmux session, starts Claude Code with the Team Lead auto-prompt, and attaches. Team starts working immediately.

### Implementation

**1. `/init` creates the symlink (new prerequisite step in `commands/init.md`)**

After the env var check, before "already initialized?":
- Check: `which teamwerk`
- If not found: Ask "Want me to install the `teamwerk` command so you can launch teams from any terminal?"
- If yes: `ln -sf "${CLAUDE_PLUGIN_ROOT}/scripts/launch-team.sh" /usr/local/bin/teamwerk`
- If permission denied: Try with `sudo`
- Confirm with checkmark
- If already exists: Skip silently

**2. Update `/init` summary message**

Change final line from:
> Next: Review your docs, then run /launch-team to start the agent team.

To:
> Next: Review your docs, then open a terminal and run: teamwerk

**3. Update `commands/launch-team.md`**

Note that users should prefer `teamwerk` from a terminal. Keep `/launch-team` as documentation/fallback.

### Files Changed

- `commands/init.md` — new prerequisite step + updated summary
- `commands/launch-team.md` — note about preferring `teamwerk` CLI
- Version bump to 0.5.0
