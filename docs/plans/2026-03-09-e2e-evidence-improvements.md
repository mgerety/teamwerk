# E2E Evidence Standard Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 3 improvements and 9 action items from the FxMobile handoff document to make Teamwerk's E2E evidence system production-grade.

**Architecture:** Replace the existing report generator with the FxMobile v2 generator (AC/regression modes, step-level detail, YAML headers, lightbox). Split `ui-test-engineer` into `mobile-test-engineer` and `web-test-engineer`. Add escalation protocol and evidence verification to relevant skills. Add new config options.

**Tech Stack:** Node.js (report generator), Markdown (skills), YAML (config)

**Source:** `/Users/michaelgerety/repos/Sinpar/FxMobile.ReactNative/docs/handoff-teamwerk-e2e-improvements.md`

---

### Task 1: Replace report generator with FxMobile v2

**Files:**
- Replace: `scripts/report-generator.js` (currently 1028 lines)
- Source: `/Users/michaelgerety/repos/Sinpar/FxMobile.ReactNative/fxmobile/scripts/generate-e2e-report.js` (~750 lines)
- Modify: `commands/generate-report.md`

**Step 1: Copy the FxMobile v2 generator**

Copy `/Users/michaelgerety/repos/Sinpar/FxMobile.ReactNative/fxmobile/scripts/generate-e2e-report.js` to `scripts/report-generator.js`.

**Step 2: Add Playwright JSON parsing**

The FxMobile generator handles JUnit XML + Maestro JSON. Port the Playwright JSON parsing from the existing `scripts/report-generator.js` (the `walkSuites` function that handles `results.suites[].specs[].tests[].results[]` structure). Add it as an additional input format alongside JUnit XML.

**Step 3: Add TRX (.NET) parsing**

Port the `parseTRX()` function from the existing generator. It parses `<TestRun> -> <Results> -> <UnitTestResult>` with outcome/duration attributes.

**Step 4: Add format auto-detection**

Port the `detectFormat()` function: `.trx` → TRX, starts with `{` → Playwright JSON, `<testsuites>` → JUnit XML, `<TestRun>` → TRX. Add a `--format` CLI arg (default: auto).

**Step 5: Preserve adversarial review integration**

Port the `parseReviewerFindings()` and `generateReviewerHtml()` functions. Keep the `--reviewer` CLI arg for `docs/adversarial-review.md`.

**Step 6: Preserve teamwerk-config.yml integration**

Keep the AC definition loading chain: config path → `work-items.active` → `acceptance-criteria.path` → `docs/acceptance-criteria.md` → auto-detect from test names. The FxMobile generator has its own AC loading from YAML headers — both should work.

**Step 7: Update the generate-report command**

Update `commands/generate-report.md` to document:
- New `--mode ac|regression` flag
- New `--screenshots` flag for explicit screenshot directory
- New `--logo`, `--company-name`, `--title` branding flags
- Updated examples showing both AC and regression modes

**Step 8: Commit**

```bash
git add scripts/report-generator.js commands/generate-report.md
git commit -m "feat: replace report generator with FxMobile v2 — AC/regression modes, step-level detail, YAML headers"
```

---

### Task 2: Split ui-test-engineer into mobile + web skills

**Files:**
- Create: `skills/mobile-test-engineer/SKILL.md`
- Create: `skills/web-test-engineer/SKILL.md`
- Keep: `skills/ui-test-engineer/SKILL.md` (deprecation redirect)

**Step 1: Create mobile-test-engineer skill**

New file `skills/mobile-test-engineer/SKILL.md`. Content is the existing `ui-test-engineer` with:
- Frontmatter name/description updated to "mobile-test-engineer"
- Remove Playwright/Cypress/Detox-specific sections
- Add Maestro-specific sections from the react-native-expo overlay
- Add YAML test header contract (Improvement 1D from handoff):
  ```yaml
  # Test: Date format shows zero-padded day
  # AC: AC-22.9
  # Purpose: Verify the date title uses zero-padded day format
  # Expected: Date displays as "February 09, 2026"
  # Preconditions: Logged in as user, on Home screen
  appId: com.app
  ```
- Add multi-AC support: `# AC: AC-22.3, AC-22.6`
- Add header quality rules (Purpose must be specific, Expected must have concrete values, Preconditions must specify state)
- Add the data contract (Improvement 1C):
  ```
  test-reports/e2e-results/
  ├── {screen}-{test-name}.xml       # JUnit XML per test
  ├── commands-{test-name}.json      # Step-by-step execution log
  ├── screenshots/                   # Named PNGs from takeScreenshot
  ```
- Add escalation protocol (see Task 3)

**Step 2: Create web-test-engineer skill**

New file `skills/web-test-engineer/SKILL.md`. Content is the existing `ui-test-engineer` with:
- Frontmatter name/description updated to "web-test-engineer"
- Remove Maestro-specific sections
- Keep Playwright/Cypress sections
- Add the same data contract adapted for Playwright:
  ```
  test-reports/e2e-results/
  ├── {suite}-{test-name}.xml        # JUnit XML per test
  ├── trace-{test-name}.json         # Playwright trace
  ├── screenshots/                   # Named PNGs
  ```
- Add test header contract adapted for TypeScript/describe blocks:
  ```typescript
  // AC: AC-3.1, AC-3.2
  // Purpose: Verify password reset email is sent
  // Expected: Success toast with "Check your email"
  // Preconditions: Logged out, valid user exists
  test('AC-3.1: Password reset sends email', async ({ page }) => {
  ```
- Add escalation protocol (see Task 3)

**Step 3: Deprecate ui-test-engineer**

Replace `skills/ui-test-engineer/SKILL.md` content with a short redirect:
```markdown
---
name: ui-test-engineer
description: "DEPRECATED — Use mobile-test-engineer or web-test-engineer instead"
---

# DEPRECATED: Use mobile-test-engineer or web-test-engineer

This skill has been split into platform-specific skills:

- **mobile-test-engineer** — Maestro YAML tests, adb, emulators, mobile-specific patterns
- **web-test-engineer** — Playwright/Cypress, browser contexts, selectors, web-specific patterns

Both enforce the same E2E Evidence Standard (data contract, test headers, escalation protocol).

Check `teamwerk-config.yml` → `testing.e2e.framework` to determine which skill applies:
- `maestro`, `detox` → mobile-test-engineer
- `playwright`, `cypress` → web-test-engineer
```

**Step 4: Update team-lead skill**

In `skills/team-lead/SKILL.md`, update the team roster section:
- Change "UI Test Engineer" to "Mobile Test Engineer / Web Test Engineer"
- Add note: "Spawn the appropriate test engineer based on `testing.e2e.framework` in config"

**Step 5: Update default roles in teamwerk-config.yml template**

In `templates/teamwerk-config.yml`, replace `ui-test-engineer` with `mobile-test-engineer` and `web-test-engineer` in the roles list (keep both, projects use whichever applies).

**Step 6: Commit**

```bash
git add skills/mobile-test-engineer/ skills/web-test-engineer/ skills/ui-test-engineer/SKILL.md skills/team-lead/SKILL.md templates/teamwerk-config.yml
git commit -m "feat: split ui-test-engineer into mobile-test-engineer and web-test-engineer with E2E evidence standard"
```

---

### Task 3: Add escalation protocol to test engineer skills

**Files:**
- Modify: `skills/mobile-test-engineer/SKILL.md` (created in Task 2)
- Modify: `skills/web-test-engineer/SKILL.md` (created in Task 2)

**Step 1: Add Escalation Protocol section to both skills**

Add the following section after the "Evidence Report Contribution" section in both skills:

```markdown
## Escalation Protocol (MANDATORY)

### 1. Progress Log

After every test attempt, append a line to the progress log file (default: `docs/e2e-run-log.md`, configurable via `testing.progress_log` in teamwerk-config.yml):

```
[YYYY-MM-DD HH:MM:SS] TEST: 01-date-format.yaml | RESULT: PASS | TIME: 20s
[YYYY-MM-DD HH:MM:SS] TEST: 02-wo-card-detail.yaml | RESULT: FAIL | ERROR: TCP forwarding crash | ATTEMPT: 2/3
```

### 2. Retry Cap

Max retries per individual test (default: 3, configurable via `testing.max_retries` in teamwerk-config.yml). After max failures:
- Log the failure with full error
- Move to the next test
- Do NOT rerun the full suite

### 3. Infra Failure Detection

If 3+ tests fail with the SAME infrastructure error (not test logic — e.g., TCP timeout, emulator crash, browser launch failure), STOP immediately and message team-lead:
- "INFRA BLOCKER: [error description]. [N] tests affected. Awaiting guidance."
- Do NOT silently retry

### 4. Single-Test Retry

When a test fails due to test logic (bad selector, wrong assertion):
- Fix that specific test file
- Rerun ONLY that test
- Never rerun passing tests

### 5. Evidence Verification Before Reporting

Before sending "done" to team-lead:
- Run `ls -la [report_output]` and include the output in your message
- Run `ls [screenshots_dir] | wc -l` and include the count
- If files don't exist, say so — do NOT claim they exist
```

**Step 2: Commit**

```bash
git add skills/mobile-test-engineer/SKILL.md skills/web-test-engineer/SKILL.md
git commit -m "feat: add escalation protocol to test engineer skills — retry caps, infra detection, progress logging"
```

---

### Task 4: Add evidence verification to team-lead skill

**Files:**
- Modify: `skills/team-lead/SKILL.md`

**Step 1: Add Evidence Verification section**

Add after the "Deterministic Validation" section in team-lead, under a new heading:

```markdown
## Evidence Verification (MANDATORY)

When any test engineer reports completion:

1. **Verify files exist.** Run `ls` on the claimed evidence paths BEFORE accepting the report. If files don't exist, reject immediately — the agent fabricated results.

2. **Check timestamps.** Evidence files should be recent (within the current session). Stale timestamps from a prior session mean the agent reused old results or didn't actually run tests.

3. **Generate the report.** Run the report generator yourself:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" --mode ac --input <results-dir> --output <report-path>
   ```

4. **Verify report size.** A real report with embedded screenshots will be hundreds of KB to several MB. If the report is < 100KB, it likely has no screenshots — reject and investigate.

5. **Check screenshot count.** The test engineer's message should include an `ls | wc -l` count. Cross-reference this with the number of tests that should have produced screenshots.
```

**Step 2: Commit**

```bash
git add skills/team-lead/SKILL.md
git commit -m "feat: add evidence verification to team-lead — reject fabricated results, verify files and timestamps"
```

---

### Task 5: Add config options to teamwerk-config.yml

**Files:**
- Modify: `templates/teamwerk-config.yml`

**Step 1: Add new config options**

Add under the `testing:` section (after the existing `evidence-dir` line, before the commented expanded config):

```yaml
  # E2E report mode: ac (group by acceptance criteria) | regression (group by screen)
  # Default: ac
  report-mode: ac

  # Max retries per individual test before moving on
  # Default: 3
  max-retries: 3

  # Progress log file for test execution tracking
  # Default: docs/e2e-run-log.md
  progress-log: "docs/e2e-run-log.md"
```

**Step 2: Commit**

```bash
git add templates/teamwerk-config.yml
git commit -m "feat: add report-mode, max-retries, progress-log config options"
```

---

## Dependency Graph

```
Task 1 (report generator) — independent
Task 2 (split skills) — independent
Task 3 (escalation protocol) — depends on Task 2 (adds to files created in Task 2)
Task 4 (evidence verification) — independent
Task 5 (config options) — independent
```

**Parallel execution:** Tasks 1, 2, 4, 5 can run in parallel. Task 3 runs after Task 2 completes.

---

## Verification Checklist

After all tasks complete:

1. [ ] `scripts/report-generator.js` supports `--mode ac` and `--mode regression`
2. [ ] `scripts/report-generator.js` handles Playwright JSON, JUnit XML, and TRX inputs
3. [ ] `scripts/report-generator.js` preserves adversarial review integration
4. [ ] `skills/mobile-test-engineer/SKILL.md` exists with Maestro-specific content + data contract + escalation
5. [ ] `skills/web-test-engineer/SKILL.md` exists with Playwright-specific content + data contract + escalation
6. [ ] `skills/ui-test-engineer/SKILL.md` is a deprecation redirect
7. [ ] `skills/team-lead/SKILL.md` has evidence verification section
8. [ ] `skills/team-lead/SKILL.md` references mobile/web test engineers instead of UI test engineer
9. [ ] `templates/teamwerk-config.yml` has `report-mode`, `max-retries`, `progress-log` options
10. [ ] `commands/generate-report.md` documents new flags
