# Teamwerk — Documentation Index

> Complete table of contents for all Teamwerk documentation.

See also: [README.md](../README.md)

---

## User Guide

| Document | Description |
|----------|-------------|
| [../README.md](../README.md) | **Start here.** Full project overview, quick start, commands, skills, and Rule Zero |

---

## Commands

Each Teamwerk slash command has a corresponding command spec:

| Document | Description |
|----------|-------------|
| [../commands/init.md](../commands/init.md) | `/init` — Project initialization, PRD and AC generation |
| [../commands/launch-team.md](../commands/launch-team.md) | `/launch-team` — Launch the agent team in tmux |
| [../commands/lint-tests.md](../commands/lint-tests.md) | `/lint-tests` — Run the Rule Zero test integrity linter |
| [../commands/generate-report.md](../commands/generate-report.md) | `/generate-report` — Generate HTML evidence report |

---

## Skills

Each agent role has a corresponding skill in `skills/`:

| Skill | Description |
|-------|-------------|
| [../skills/project-analyst/](../skills/project-analyst/) | Project analysis, PRD generation, requirement brainstorming |
| [../skills/team-lead/](../skills/team-lead/) | Team coordination, task breakdown, dependency management |
| [../skills/backend-builder/](../skills/backend-builder/) | API/server implementation |
| [../skills/frontend-builder/](../skills/frontend-builder/) | Web UI implementation |
| [../skills/api-test-engineer/](../skills/api-test-engineer/) | API and integration test authoring |
| [../skills/ui-test-engineer/](../skills/ui-test-engineer/) | E2E browser test authoring |
| [../skills/test-reviewer/](../skills/test-reviewer/) | Test quality review and Rule Zero enforcement |
| [../skills/test-quality-standards/](../skills/test-quality-standards/) | Reference: Rule Zero, test naming, evidence requirements |
| [../skills/test-designer/](../skills/test-designer/) | Test design patterns and strategies |
| [../skills/adversarial-reviewer/](../skills/adversarial-reviewer/) | Adversarial testing and security review patterns |

---

## Stack Overlays

Framework-specific conventions applied automatically or via `teamwerk-config.yml`:

| Overlay | Description |
|---------|-------------|
| [../overlays/express/](../overlays/express/) | Express.js API patterns |
| [../overlays/dotnet/](../overlays/dotnet/) | .NET/ASP.NET Core patterns |
| [../overlays/react/](../overlays/react/) | React component and testing patterns |
| [../overlays/angular/](../overlays/angular/) | Angular module and RxJS patterns |
| [../overlays/react-native-expo/](../overlays/react-native-expo/) | Expo/React Native patterns |

---

## Configuration

| File | Description |
|------|-------------|
| [../templates/teamwerk-config.yml](../templates/teamwerk-config.yml) | Config template for project-level configuration |
| [../templates/acceptance-criteria.md](../templates/acceptance-criteria.md) | Acceptance criteria template |
| [../hooks/hooks.json](../hooks/hooks.json) | PostToolUse hook configuration |

---

## Agents

Agent orchestration configuration:

| Document | Description |
|----------|-------------|
| [../agents/test-reviewer.md](../agents/test-reviewer.md) | Test reviewer agent definition |

---

## Plans

| Document | Description |
|----------|-------------|
| [plans/2026-02-16-global-teamwerk-command-design.md](plans/2026-02-16-global-teamwerk-command-design.md) | Global Teamwerk command design decisions |

---

## Index Maintenance

This index is maintained by the Documentation Agent. Whenever a new doc is added, update this file.

Last audited: 2026-02-23
