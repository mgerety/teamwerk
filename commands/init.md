---
name: init
description: Initialize a project for Teamwerk agent teams — sets up environment, generates PRD and acceptance criteria
user_invocable: true
---

Initialize the current project for Teamwerk agent teams.

## Steps

1. **Check prerequisites and auto-fix.**

   Run these checks in order. Fix what you can, guide the user on the rest:

   a. **tmux**: Run `which tmux`. If not found:
      - On macOS: Ask "tmux is required for agent teams. Want me to install it? (`brew install tmux`)"
      - On Linux: Ask "tmux is required. Want me to install it? (`sudo apt install tmux`)"
      - If user agrees, run the install command. If not, stop and explain it's required.

   b. **Node.js**: Run `which node`. If not found, tell the user: "Node.js is required for the test linter and report generator. Install it from https://nodejs.org" and stop.

   c. **Environment variable**: Check if `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set by running `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. If empty or not "1":
      - Ask: "Agent Teams requires the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable. Want me to add it to your shell profile?"
      - If user agrees:
        - Detect shell: run `echo $SHELL`. Use `~/.zshrc` for zsh, `~/.bashrc` for bash.
        - Run: `echo 'export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1' >> [profile] && source [profile]`
        - Confirm: "✅ Environment variable added and loaded."
      - If user declines, explain it's required for agent teams and stop.
      - Note: The launch script also sets this for the session, so it works immediately either way.

   d. **Global `teamwerk` command**: Run `which teamwerk`. If not found:
      - Ask: "Want me to install the `teamwerk` command so you can launch teams from any terminal?"
      - If user agrees:
        - On macOS with Homebrew: Run `ln -sf "${CLAUDE_PLUGIN_ROOT}/scripts/launch-team.sh" /opt/homebrew/bin/teamwerk`
        - Otherwise: Run `ln -sf "${CLAUDE_PLUGIN_ROOT}/scripts/launch-team.sh" /usr/local/bin/teamwerk`
        - If permission denied, try with `sudo`
        - Confirm: "✅ `teamwerk` command installed. Run `teamwerk` from any terminal to launch a team."
      - If user declines, explain they can always run the launch script manually.
      - If already exists: Skip silently.

   e. **Git workflow**: Ask the user:
      > "What git branching strategy do you use?"
      >
      > **(a) GitHub Flow** — feature branches off `main`, PRs back to `main` (recommended for most projects)
      > **(b) Trunk-Based Development** — short-lived branches, frequent merges to `main`
      > **(c) GitFlow** — `develop` branch with feature/bugfix/hotfix/release branches
      > **(d) None** — no branch management, agents work on whatever branch is checked out

      Based on the answer, set the `git:` section in `teamwerk-config.yml` with appropriate defaults:
      - **(a) github-flow**: protected `[main]`, prefix `feature`, pr-target `main`
      - **(b) trunk-based**: protected `[main]`, prefix `feature`, pr-target `main`
      - **(c) gitflow**: protected `[main, develop]`, prefix `feature`, pr-target `develop`
      - **(d) none**: no git section needed (or `strategy: none`)

      If the user picks (a), (b), or (c), also ask:
      > "Should the Team Lead create a draft PR when work is complete? (yes/no, default: yes)"

      If PR creation is enabled, check for `gh` CLI: run `which gh`. If not found:
      - Ask: "The `gh` CLI is needed for draft PR creation. Want me to install it? (`brew install gh`)"
      - If user agrees, run `brew install gh`
      - If user declines, set `create-pr: false` and note that PRs will need to be created manually

   f. **Testing framework**: Ask the user:
      > "What testing framework does your project use?"
      >
      > **(a) Playwright** — browser automation for web apps (recommended for web)
      > **(b) Maestro** — YAML-based mobile testing for React Native, iOS, Android
      > **(c) .NET Test** — dotnet test with MSTest/NUnit/xUnit
      > **(d) pytest** — Python testing framework
      > **(e) Jest** — JavaScript unit/integration testing
      > **(f) Auto-detect** — let Teamwerk figure it out from project files (default)

      Based on the answer, set the `testing:` section in `teamwerk-config.yml`:
      - **(a) playwright**: framework `playwright`, result-format `playwright-json`
      - **(b) maestro**: framework `maestro`, result-format `junit-xml`
      - **(c) dotnet-test**: framework `dotnet-test`, result-format `trx`
      - **(d) pytest**: framework `pytest`, result-format `junit-xml`
      - **(e) jest**: framework `jest`, result-format `playwright-json`
      - **(f) auto**: framework `auto`, result-format `auto`

      Also ask:
      > "Does your app require login? If so, should tests share a login session for efficiency?"
      >
      > **(a) Shared session** — login once, share across tests (recommended)
      > **(b) Per-test** — each test logs in independently
      > **(c) No auth** — app doesn't require login

      Set `session-strategy` accordingly: `shared-session`, `per-test`, or `none`.

   g. **Already initialized?**: Check if `docs/prd.md` exists. If it does, ask:
      > "This project has already been initialized. What would you like to do?"
      >
      > **(a) Add new acceptance criteria** — generate additional ACs from new requirements and append to active work items
      > **(b) Re-initialize** — overwrite existing PRD and ACs (destructive)
      > **(c) Skip** — keep existing docs, just update config and prerequisites

      For option (a):
      - Ask for the new requirements (file path, URL, or paste content)
      - Use the **project-analyst** skill to generate new ACs with IDs that do NOT conflict with existing ones (read existing ACs first to find the highest ID)
      - Append the new ACs to the active work items file (from `work-items.active` config or `docs/acceptance-criteria.md`)
      - Skip PRD regeneration — the existing PRD is kept

2. **Discover the project** (silently, no user interaction needed).

   Examine the project directory to detect:
   - **Tech stack**: Look for `package.json`, `*.csproj`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`
   - **Existing test infrastructure**: Look for `tests/`, `test/`, `__tests__/`, `spec/`, `Tests/` directories
   - **Existing documentation**: Look for `docs/`, `README.md`, `CLAUDE.md`
   - **Stack overlay**: Based on detected stack, determine which Teamwerk overlay applies (express, dotnet, react, angular, react-native-expo)

3. **Source the PRD.**

   Ask the user:

   > "Do you have a project document already (PRD, spec, project charter), or would you like to brainstorm one?"

   **If they have a document:**
   - Ask: "Where is it? Give me the file path, URL, or paste the content."
   - If it's a file path: Read the file
   - If it's a URL: Fetch and parse it
   - If they mention Azure DevOps or Jira: Say "Direct ADO/Jira integration is coming in a future version. For now, you can export it as markdown, paste the content here, or point me to a file."
   - Once you have the content, use the **project-analyst** skill in parse mode to normalize it into Teamwerk's PRD format

   **If they want to brainstorm:**
   - Use the **project-analyst** skill in brainstorm mode
   - Guide the interactive conversation (elevator pitch → users → stack → features → constraints → out of scope)
   - Generate the PRD from the conversation

4. **Generate project files.**

   After the PRD and acceptance criteria are generated by the project-analyst skill:

   a. **`teamwerk-config.yml`**: Create at project root with:
      - Project name (from PRD)
      - Work items config: `work-items.source: markdown`, `work-items.active: "docs/acceptance-criteria.md"`, `work-items.done: "docs/done/"`, `work-items.backlog: "docs/backlog/"`
      - Test directories (detected or default)
      - Test file patterns (based on stack)
      - Report output path
      - Stack overlay (detected)
      - Team roles (all 8 by default: team-lead, backend-builder, frontend-builder, test-designer, api-test-engineer, ui-test-engineer, test-reviewer, adversarial-reviewer)
      - Git workflow config (from step 1e): strategy, protected-branches, branch-prefix, pr-target, create-pr
      - Testing config (from step 1f): framework, result-format, session-strategy, results-path, evidence-dir

   a2. **`docs/done/` and `docs/backlog/`**: Create these empty directories for the work item lifecycle. The Team Lead uses `docs/done/` to archive completed ACs and `docs/backlog/` stores future work items.

   b. **`CLAUDE.md`**: Create or append to the project's CLAUDE.md with:
      ```
      ## Teamwerk Project Configuration

      ### Source of Truth
      - **PRD**: docs/prd.md — defines what we're building and why
      - **Acceptance Criteria**: docs/acceptance-criteria.md — defines done
      - **Config**: teamwerk-config.yml — project configuration

      ### Rules
      - Every code change must trace to a functional requirement (FR) in the PRD
      - Every test must reference an acceptance criterion (AC) by ID
      - Rule Zero: Tests must NEVER modify the application under test
      - See the test-quality-standards skill for test quality requirements

      ### Stack
      [Detected stack info and overlay]
      ```

5. **Print the ready check summary.**

   Display a clear summary:
   ```
   === Teamwerk Initialized ===

   ✅ tmux: ready
   ✅ Node.js: ready
   ✅ Environment: configured

   📄 PRD: docs/prd.md
   📋 Work Items: docs/acceptance-criteria.md (X active ACs)
   📁 Backlog: docs/backlog/ (empty)
   📁 Archive: docs/done/ (empty)
   ⚙️  Config: teamwerk-config.yml ([overlay] overlay)
   🔀 Git: [strategy] (protected: [branches], PR target: [target], draft PR: [yes/no])
   🧪 Testing: [framework] (session: [strategy], report format: [format])
   📝 CLAUDE.md: updated

   Next: Review your docs, then open a terminal and run: teamwerk
   ```
