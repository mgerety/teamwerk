---
name: generate-report
description: Generate an HTML evidence report from test results
user_invocable: true
---

Generate a self-contained HTML evidence report from test results.

## Steps

1. **Check for test results.** Look for test output files in the project:
   - JUnit XML output (e.g., `test-reports/e2e-results/*.xml`, `build/test-results/*.xml`)
   - Playwright JSON reporter output (e.g., `tests/report/test-results.json`, `test-results.json`)
   - .NET TRX output (e.g., `TestResults/*.trx`)

   If `teamwerk-config.yml` has a `testing.results-path`, check there first.

   The report generator reads AC definitions from YAML test file headers (`# AC:` tags) and/or from the `work-items.active` path in `teamwerk-config.yml`.

2. **If no results found:** Tell the user to run their tests first with an appropriate reporter. Examples:
   ```bash
   # Maestro (produces JUnit XML)
   maestro test --format junit tests/e2e/flows/ --output test-reports/e2e-results/

   # Playwright (produces JSON)
   npx playwright test --reporter=json > tests/report/test-results.json

   # Playwright (produces JUnit XML)
   npx playwright test --reporter=junit

   # .NET
   dotnet test --logger "trx;LogFileName=test-results.trx"

   # pytest
   pytest --junitxml=test-results.xml
   ```

3. **Run the report generator:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" \
     --input <results-dir> \
     --output <report.html> \
     [--mode ac|regression] \
     [--format auto|junit-xml|playwright-json|trx] \
     [--tests <yaml-test-dir>] \
     [--screenshots <screenshots-dir>] \
     [--reviewer <adversarial-review.md>] \
     [--config <teamwerk-config.yml>] \
     [--logo <png-path>] \
     [--company-name <name>] \
     [--title <title>]
   ```

   **Flags:**
   - `--mode ac` (default) — Group tests by acceptance criteria. Only shows tests with `# AC:` tags. Ideal for PR review.
   - `--mode regression` — Group tests by screen. Shows ALL tests. Ideal for regression suite runs.
   - `--format auto` (default) — Auto-detect from file content. Or specify: `junit-xml`, `playwright-json`, `trx`
   - `--reviewer` — Path to adversarial review markdown. Auto-detects `docs/adversarial-review.md` if present.
   - `--config` — Path to `teamwerk-config.yml` for AC definition loading.
   - `--screenshots` — Explicit screenshot directory. Auto-searches `input/screenshots/`, `test-reports/screenshots/`, and input dir.
   - `--logo` — Path to PNG logo file for report branding.
   - `--company-name` — Company name displayed in report header.
   - `--title` — Custom report title.

4. **Examples:**
   ```bash
   # AC mode with adversarial review (most common for PR review)
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" \
     --mode ac \
     --input test-reports/e2e-results \
     --reviewer docs/adversarial-review.md

   # Regression mode for full suite
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" \
     --mode regression \
     --input test-reports/e2e-results

   # Branded report with company logo
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" \
     --mode ac \
     --logo assets/logo.png \
     --company-name "Acme Corp" \
     --title "Sprint 5 E2E Evidence"

   # Playwright JSON results
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" \
     --format playwright-json \
     --input tests/report/test-results.json
   ```

5. **Report the output location.** Tell the user where the HTML file was generated.

6. **Mention how to review.** The report is a self-contained HTML file that can be opened directly in a browser. No server required. All screenshots are base64-embedded.
