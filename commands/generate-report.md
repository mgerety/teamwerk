---
name: generate-report
description: Generate an HTML evidence report from test results
user_invocable: true
---

Generate a self-contained HTML evidence report from test results.

## Steps

1. **Check for test results.** Look for test output files in the project:
   - Playwright JSON reporter output (e.g., `tests/report/test-results.json`, `test-results.json`)
   - JUnit XML output (e.g., `test-results.xml`, `build/test-results/*.xml`)
   - .NET TRX output (e.g., `TestResults/*.trx`)
   - Jest JSON output

   If `teamwerk-config.yml` has a `testing.results-path`, check there first.

   The report generator reads AC definitions from the `work-items.active` path in `teamwerk-config.yml`. This can be a single file (e.g., `docs/acceptance-criteria.md`) or a directory of `.md` files. Legacy `acceptance-criteria.path` config is also supported.

2. **If no results found:** Tell the user to run their tests first with an appropriate reporter. Examples:
   ```bash
   # Playwright
   npx playwright test --reporter=json > tests/report/test-results.json

   # Maestro (produces JUnit XML by default)
   maestro test --format junit tests/e2e/flows/ --output test-results.xml

   # .NET
   dotnet test --logger "trx;LogFileName=test-results.trx"

   # pytest
   pytest --junitxml=test-results.xml
   ```

3. **Detect the result format.** Check `teamwerk-config.yml` for `testing.result-format`.
   If not set or "auto", detect from file:
   - `.json` files → check for Playwright JSON structure
   - `.xml` files → check for `<testsuites>` (JUnit) or `<TestRun>` (TRX)
   - `.trx` files → TRX format

4. **Include adversarial review.** If `docs/adversarial-review.md` exists, include it:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" \
     --results <path-to-results> \
     --format <detected-format> \
     --reviewer docs/adversarial-review.md \
     --output <project>/tests/report/evidence-report.html
   ```

   If no adversarial review exists, omit the `--reviewer` flag:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" \
     --results <path-to-results> \
     --format <detected-format> \
     --output <project>/tests/report/evidence-report.html
   ```

5. **Report the output location.** Tell the user where the HTML file was generated (e.g., `tests/report/evidence-report.html`).

6. **Mention how to review.** The report is a self-contained HTML file that can be opened directly in a browser for review. No server required.
