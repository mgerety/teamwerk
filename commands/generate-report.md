---
name: generate-report
description: Generate an HTML evidence report from test results
user_invocable: true
---

Generate a self-contained HTML evidence report from test results.

## Steps

1. **Check for test results.** Look for test output files in the project:
   - Playwright JSON reporter output (e.g., `tests/report/test-results.json`, `test-results.json`)
   - Jest JSON output
   - Any other structured test output

2. **If no results found:** Tell the user to run their tests first with a JSON reporter enabled. For example:
   ```bash
   npx playwright test --reporter=json > tests/report/test-results.json
   ```

3. **Generate the report.** Run the report generator:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report-generator.js" --results <path-to-results> --output <project>/tests/report/evidence-report.html
   ```

4. **Report the output location.** Tell the user where the HTML file was generated (e.g., `tests/report/evidence-report.html`).

5. **Mention how to review.** The report is a self-contained HTML file that can be opened directly in a browser for review. No server required.
