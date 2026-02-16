# Teamwerk

AI agent team orchestration with built-in test quality guardrails.

Install once, use everywhere. Stack-agnostic by default with optional stack overlays.

---

## What It Does

- Coordinates 6-agent teams: Team Lead, Backend Builder, Frontend Builder, API Test Engineer, UI Test Engineer, Test Reviewer
- **`/init`** sets up your entire project — generates PRD, acceptance criteria, config, and environment from a single command
- Enforces **Rule Zero**: tests must NEVER modify the application under test
- Generates HTML evidence reports with full traceability (PRD → ACs → Tests → Evidence)
- Works across any tech stack (Express, .NET, React, Angular, React Native, etc.)

## Quick Start

```bash
# Install from marketplace
/plugin marketplace add mgerety/teamwerk
/plugin install teamwerk@mgerety

# Restart Claude Code, then:
/init
# → "Do you have a project doc, or want to brainstorm?"
# → Generates PRD, acceptance criteria, config, CLAUDE.md
# → "Review your docs, then /launch-team"

/launch-team
# → Everything is automatic from here
```

## Prerequisites

Handled automatically by `/init`:
- **tmux** — installed automatically if missing (macOS/Linux)
- **Node.js** — required for linter and report generator (checked by `/init`)
- **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`** — configured by `/init`
- **Claude Code CLI** — you already have this if you're reading this

## How to Get Started

Run `/init`. That's it.

`/init` will:
1. Check and install prerequisites (tmux, env var)
2. Detect your tech stack and test infrastructure
3. Ask if you have an existing project document or want to brainstorm
4. Generate `docs/prd.md` (your project charter and requirements)
5. Auto-derive `docs/acceptance-criteria.md` from the PRD
6. Create `teamwerk-config.yml` and update `CLAUDE.md`
7. Tell you to review, then `/launch-team`

### Two Paths

**"I have a document"** — Point `/init` to your existing PRD, project charter, spec, or handoff doc (local file or URL). Teamwerk reads it, normalizes it into standard format, and auto-derives acceptance criteria.

**"Let's brainstorm"** — `/init` guides you through a structured conversation (elevator pitch → users → stack → features → constraints → scope boundaries) and generates the PRD for you.

## Document Chain

```
/init
  │
  ├─ "I have a doc" ──→ Parse & normalize ──┐
  │                                          │
  ├─ "Brainstorm"   ──→ Guided convo ───────┤
  │                                          ▼
  │                                docs/prd.md
  │                                docs/acceptance-criteria.md
  │                                teamwerk-config.yml
  │                                CLAUDE.md
  ▼
/launch-team
  ├── Team Lead reads PRD + ACs
  ├── Backend Builder implements
  ├── Frontend Builder implements
  ├── API Test Engineer tests
  ├── UI Test Engineer tests
  ├── Test Reviewer reviews
  └── Evidence Report generated
```

**`docs/prd.md`** — The source of truth. What you're building, why, for whom, tech stack, architecture, functional requirements (FR-01, FR-02...), non-functional requirements, and explicit scope boundaries.

**`docs/acceptance-criteria.md`** — Auto-derived from the PRD. Each functional requirement becomes testable ACs in Given/When/Then format. AC IDs trace to FR IDs (AC-1.1 → FR-01). This is what the agent team builds and tests against.

## Commands

| Command | Description |
|---------|-------------|
| `/init` | Initialize a project — sets up environment, generates PRD and acceptance criteria interactively |
| `/launch-team` | Launch the agent team in a tmux session with dedicated panes per agent |
| `/lint-tests` | Run the Rule Zero linter against test files to detect integrity violations |
| `/generate-report` | Generate a self-contained HTML evidence report from test results |

## Skills

Teamwerk includes 8 skills:

| Skill | Purpose |
|-------|---------|
| **project-analyst** | Brainstorms or parses project requirements — generates the PRD and acceptance criteria that drive the entire team |
| **team-lead** | Coordinates the agent team, manages the task list, enforces build order, traces work from FRs to ACs to tasks |
| **backend-builder** | Builds API/server endpoints with input validation, error handling, authentication, and security hardening |
| **frontend-builder** | Builds the web UI with styled components, accessibility, XSS prevention, and responsive layout |
| **api-test-engineer** | Writes and executes API/integration tests — request/response contracts, auth flows, adversarial inputs, error format validation |
| **ui-test-engineer** | Writes and executes E2E browser tests — visual verification protocol, styled-state assertions, modal/overlay testing, screenshot evidence |
| **test-reviewer** | Quality gate for all tests — reviews for Rule Zero violations, deduplication, coverage gaps, happy path bias, trivial assertions |
| **test-quality-standards** | Reference document defining Rule Zero, the 6 categories of garbage tests, naming conventions, evidence requirements |

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

1. **Project Analyst** (via `/init`) generates the PRD and acceptance criteria from your input — either parsing an existing document or brainstorming from scratch.
2. **Team Lead** reads the PRD, architecture notes, and acceptance criteria. Breaks each FR into backend tasks, frontend tasks, and test tasks with correct dependencies.
3. **Backend Builder** implements API endpoints first. Signals readiness to the Team Lead when each endpoint is complete.
4. **Frontend Builder** wires up the UI to ready API endpoints. Waits for backend signals before starting each feature.
5. **API Test Engineer** writes API/integration tests once backend endpoints are ready. **UI Test Engineer** writes E2E browser tests once frontend features are ready. Both work in parallel.
6. **Test Reviewer** reviews every test against 7 quality criteria. Rejects tests that violate Rule Zero, duplicate coverage, miss edge cases, use hardcoded waits, or take unverified screenshots.
7. The cycle repeats until all tests pass review. The UI Test Engineer then generates the HTML evidence report with AC traceability matrix, verified screenshots, API response logs, and coverage gap analysis.

## Rule Zero

Tests must observe and report. They must never fix, patch, or work around application behavior. A test that modifies the DOM, injects styles, or patches application functions to make itself pass is worse than no test at all -- it hides real defects behind false confidence. Violation of Rule Zero is an automatic rejection with no appeal.

## Hooks

Teamwerk includes a `PostToolUse` hook that automatically runs the test integrity linter whenever a test file is written or edited. This catches Rule Zero violations in real time before the test suite runs.

## Remote / Headless Usage

Teamwerk works well over SSH for headless development:

1. SSH into your Mac Mini or remote server
2. Run `/init` to set up, then `/launch-team`
3. All agent output is visible over SSH in the tmux panes
4. Detach with `Ctrl+B` then `D` to leave the team running
5. Reattach with `tmux attach -t <session-name>` from any SSH session
6. Switch between agent panes with `Ctrl+B` then arrow keys

No GUI or display server required. The HTML evidence report is a static file you can `scp` to your local machine or open in any browser.

## License

MIT
