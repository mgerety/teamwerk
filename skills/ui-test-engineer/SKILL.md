---
name: ui-test-engineer
description: "DEPRECATED — Use mobile-test-engineer or web-test-engineer instead"
---

# DEPRECATED: Use mobile-test-engineer or web-test-engineer

This skill has been split into platform-specific skills:

- **mobile-test-engineer** — Maestro YAML tests, adb, emulators, mobile-specific patterns
- **web-test-engineer** — Playwright/Cypress, browser contexts, selectors, web-specific patterns

Both enforce the same E2E Evidence Standard (data contract, test headers, escalation protocol, visual verification).

Check `teamwerk-config.yml` → `testing.e2e.framework` to determine which skill applies:
- `maestro`, `detox` → mobile-test-engineer
- `playwright`, `cypress` → web-test-engineer
