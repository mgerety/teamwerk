# Teamwerk

AI agent team orchestration with built-in test quality guardrails.

Install once, use everywhere. Stack-agnostic by default with optional stack overlays.

---

## What It Does

- Coordinates 6-agent teams: Team Lead, Backend Builder, Frontend Builder, API Test Engineer, UI Test Engineer, Test Reviewer
- Enforces **Rule Zero**: tests must NEVER modify the application under test
- Generates HTML evidence reports with acceptance criteria traceability
- Works across any tech stack (Express, .NET, React, Angular, React Native, etc.)

## Quick Start

```bash
# Install from marketplace
/plugin marketplace add mgerety/teamwerk
/plugin install teamwerk@mgerety

# Or for local development
/plugin marketplace add /path/to/teamwerk
/plugin install teamwerk@teamwerk-dev

# Restart Claude Code, then:
/launch-team
```

## Prerequisites

- **Claude Code CLI**
- **tmux** -- for Agent Teams mode (`brew install tmux` on macOS, `apt install tmux` on Debian/Ubuntu)
- **Node.js** -- for the test integrity linter and report generator
- **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`** environment variable

## Project Setup

1. Copy `templates/acceptance-criteria.md` to your project's `docs/acceptance-criteria.md`
2. Fill in your acceptance criteria using the Given/When/Then format
3. Optionally copy `templates/playwright.config.js` to your project root
4. Optionally copy `templates/teamwerk-config.yml` to your project root
5. Run `/launch-team`

## Commands

| Command | Description |
|---------|-------------|
| `/launch-team` | Launch the agent team in a tmux session with dedicated panes per agent |
| `/lint-tests` | Run the Rule Zero linter against test files to detect integrity violations |
| `/generate-report` | Generate a self-contained HTML evidence report from test results |

## Skills

Teamwerk includes 7 skills that are automatically loaded by agents when they join the team:

| Skill | Purpose |
|-------|---------|
| **team-lead** | Coordinates the agent team, manages the task list, enforces build order, and ensures all acceptance criteria are covered before declaring the project complete |
| **backend-builder** | Builds API/server endpoints with input validation, error handling, authentication, and security hardening as defined by the acceptance criteria |
| **frontend-builder** | Builds the web UI with styled components, accessibility, XSS prevention, and responsive layout as defined by the acceptance criteria |
| **api-test-engineer** | Writes and executes API/integration tests — request/response contracts, auth flows, adversarial inputs, error format validation. No browser interaction. |
| **ui-test-engineer** | Writes and executes E2E browser tests — visual verification protocol (no white-screen screenshots), styled-state assertions, modal/overlay testing, screenshot evidence with pre-capture content checks |
| **test-reviewer** | Quality gate for all tests -- reviews every test for Rule Zero violations, deduplication, coverage gaps, happy path bias, trivial assertions, hardcoded waits, and screenshot verification |
| **test-quality-standards** | Reference document defining Rule Zero, the 6 categories of garbage tests, naming conventions, evidence requirements, and minimum coverage guidance |

## Stack Overlays

Stack overlays provide framework-specific conventions and patterns. They are auto-detected from your project's build configuration, or you can set one explicitly in `teamwerk-config.yml`.

| Overlay | Covers |
|---------|--------|
| `express` | Express.js API patterns, middleware conventions, route structure, error handling |
| `dotnet` | .NET/ASP.NET Core project structure, controller patterns, xUnit/NUnit conventions |
| `react` | React component patterns, state management, JSX conventions, testing-library idioms |
| `angular` | Angular module structure, component/service patterns, RxJS conventions |
| `react-native-expo` | Expo project structure, native component patterns, device testing considerations |

## How It Works

1. **Team Lead** reads the project's acceptance criteria and `CLAUDE.md`, then breaks each AC into backend tasks, frontend tasks, and test tasks with correct dependencies.
2. **Backend Builder** implements API endpoints first. Signals readiness to the Team Lead when each endpoint is complete.
3. **Frontend Builder** wires up the UI to ready API endpoints. Waits for backend signals before starting each feature.
4. **API Test Engineer** writes API/integration tests once backend endpoints are ready. **UI Test Engineer** writes E2E browser tests once frontend features are ready. Both work in parallel.
5. **Test Reviewer** reviews every test against 7 quality criteria. Rejects tests that violate Rule Zero, duplicate coverage, miss edge cases, use hardcoded waits, or take unverified screenshots.
6. The cycle repeats until all tests pass review. The UI Test Engineer then generates the HTML evidence report with AC traceability matrix, verified screenshots, API response logs, and coverage gap analysis.

## Rule Zero

Tests must observe and report. They must never fix, patch, or work around application behavior. A test that modifies the DOM, injects styles, or patches application functions to make itself pass is worse than no test at all -- it hides real defects behind false confidence. Violation of Rule Zero is an automatic rejection with no appeal.

## Hooks

Teamwerk includes a `PostToolUse` hook that automatically runs the test integrity linter whenever a test file is written or edited. This catches Rule Zero violations in real time before the test suite runs.

## Remote / Headless Usage

Teamwerk works well over SSH for headless development:

1. SSH into your Mac Mini or remote server
2. Run `/launch-team` -- the tmux session starts with one pane per agent
3. All agent output is visible over SSH in the tmux panes
4. Detach with `Ctrl+B` then `D` to leave the team running
5. Reattach with `tmux attach -t <session-name>` from any SSH session
6. Switch between agent panes with `Ctrl+B` then arrow keys

No GUI or display server required. The HTML evidence report is a static file you can `scp` to your local machine or open in any browser.

## License

MIT
