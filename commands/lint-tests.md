---
name: lint-tests
description: Run the test integrity linter to check for Rule Zero violations
user_invocable: true
---

Run the test integrity linter against test files to detect Rule Zero violations (hardcoded waits, trivial assertions, missing AC references, etc.).

## Steps

1. **Parse arguments.** If the user provided `--dir <directory>` or `--file <filepath>` arguments, pass them through to the linter. Otherwise, run against the entire project.

2. **Run the linter.**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/test-integrity-linter.js" [--dir <directory>] [--file <filepath>]
   ```

3. **Report results.**
   - If violations are found: list each violation clearly, including the file path, line number, rule violated, and what needs to change to fix it.
   - If clean: confirm that no Rule Zero violations were detected across the scanned files.

4. **Summarize.** Provide a count of files scanned, violations found, and a breakdown by violation type if applicable.
