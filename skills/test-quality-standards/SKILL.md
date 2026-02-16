---
name: test-quality-standards
description: "Use when writing, reviewing, or evaluating test quality — enforces Rule Zero and 6 garbage test categories to prevent tests from hiding bugs"
---

# Test Quality Standards

These standards define what constitutes an acceptable test. Any agent reviewing tests MUST enforce these standards and reject tests that violate them.

---

## Rule Zero: Tests Must NEVER Modify the Application Under Test

This is the most important rule. It overrides everything else.

**A test must observe and report. It must NEVER fix, patch, or work around application behavior.**

Specifically, tests MUST NOT:
- Use browser automation APIs to change DOM state, CSS, classes, or element visibility
- Inject observers, stylesheets, or scripts into the application
- Set `.style`, `.hidden`, `.innerHTML`, `.className`, or `.classList` on application elements
- Remove, move, or reparent DOM elements
- Override or monkey-patch application functions
- Add event listeners that alter application behavior
- Call application-internal functions to change state

**If the application is broken, the test FAILS.** The test documents the defect -- it does not hide it.

A test that patches a bug to make itself pass is **worse than no test at all**, because it creates false confidence that the application works when a real user would hit the bug.

### Rule Zero Examples by Language

**JavaScript (Playwright / Puppeteer)**
```js
// ACCEPTABLE -- reading computed style for assertion
const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// ACCEPTABLE -- counting elements for assertion
const count = await page.evaluate(() => document.querySelectorAll('.item').length);

// UNACCEPTABLE -- modifying the application
await page.evaluate(() => {
  document.getElementById('modal').style.display = 'none'; // VIOLATION
});

// UNACCEPTABLE -- "fixing" a CSS bug in test code
await page.evaluate(() => {
  const el = document.getElementById('overlay');
  el.hidden = true; // VIOLATION -- test is changing app state
});
```

**C# (Selenium WebDriver)**
```csharp
// ACCEPTABLE -- reading state for assertion
var bgColor = driver.ExecuteScript("return getComputedStyle(document.body).backgroundColor;");

// ACCEPTABLE -- counting elements for assertion
var count = driver.ExecuteScript("return document.querySelectorAll('.item').length;");

// UNACCEPTABLE -- modifying the application
driver.ExecuteScript("document.getElementById('modal').style.display = 'none';"); // VIOLATION

// UNACCEPTABLE -- injecting a fix for a broken overlay
driver.ExecuteScript("document.getElementById('overlay').hidden = true;"); // VIOLATION
```

**Python (Selenium WebDriver)**
```python
# ACCEPTABLE -- reading state for assertion
bg_color = driver.execute_script("return getComputedStyle(document.body).backgroundColor;")

# ACCEPTABLE -- counting elements for assertion
count = driver.execute_script("return document.querySelectorAll('.item').length;")

# UNACCEPTABLE -- modifying the application
driver.execute_script("document.getElementById('modal').style.display = 'none';")  # VIOLATION

# UNACCEPTABLE -- injecting a fix for a broken overlay
driver.execute_script("document.getElementById('overlay').hidden = true;")  # VIOLATION
```

**The ONLY acceptable use of script execution in a test is one that READS state without modifying it.**

**Violation of Rule Zero is an automatic test rejection with no appeal.** The Test Reviewer must flag this as a critical defect in the application, not a test issue to work around.

---

## What Makes a Test "Garbage"

A test is GARBAGE and must be REJECTED if it:

### 0. Modifies the Application Under Test (Rule Zero Violation)
Any test that uses browser script execution, style injection, script injection, or any other mechanism to change the DOM, CSS, or JavaScript behavior of the application is **automatically rejected**. See Rule Zero above.

### 1. Tests the Same Thing Twice (Deduplication)
Two tests that assert different values of the same type against the same behavior are effectively duplicates.

**GARBAGE example:**
```
test('accepts string input A', () => {
  // sends { title: 'Hello' }, expects 201
});
test('accepts string input B', () => {
  // sends { title: 'World' }, expects 201
});
```
These both test "valid string input produces success." One test is sufficient.

### 2. Only Tests the Happy Path
A test suite that only verifies success scenarios with valid input is incomplete.

**REQUIRED**: Every feature must have tests for:
- Valid input (happy path)
- Invalid/missing input (error handling)
- Edge cases (empty strings, very long strings, special characters)
- At least one adversarial input (injection attempts, malformed data)

### 3. Asserts Trivially True Things
```
test('object has a property', () => {
  const item = { title: 'Test' };
  expect(item.title).toBe('Test');
});
```
This tests the programming language's object literals, not your application. It will never fail unless the language itself breaks.

### 4. Does Not Map to an Acceptance Criterion
Every test must trace back to a specific acceptance criterion from the project's acceptance criteria document. Tests that do not validate any AC are noise.

### 5. Uses Hardcoded Waits Instead of State Checks
```
await page.click('#login-button');
await page.waitForTimeout(3000); // GARBAGE
```
Should be:
```
await page.click('#login-button');
await page.waitForSelector('#dashboard', { state: 'visible' }); // State-based
```

### 6. Takes Screenshots Without Analyzing Them
Taking a screenshot is not evidence. The test must:
- Capture the screenshot at a meaningful point (after action, showing result)
- Assert something about the visible state (element exists, text is present)
- Log what the screenshot is supposed to show

**GARBAGE:**
```
await page.screenshot({ path: 'screenshot.png' });
// No assertion, no analysis
```

**ACCEPTABLE:**
```
await page.screenshot({ path: 'evidence/ac3-completed-item.png' });
const completedItem = page.locator('.item.completed');
await expect(completedItem).toBeVisible();
await expect(completedItem).toHaveCSS('text-decoration-line', 'line-through');
```

---

## Test Naming Convention

Tests must be named with their AC reference:
```
AC-1: Creates item with valid title and description
AC-1: Rejects empty title with 400 error
AC-5: Handles malformed JSON gracefully
AC-6: Sanitizes XSS payload in input field
```

## Test Evidence Requirements

Every test run must produce:

1. **AC Traceability Matrix** -- A table mapping each AC to its test(s) and pass/fail status
2. **Screenshots** -- Captured at key UI states with descriptive filenames
3. **API Response Logs** -- For every API test, log the request and full response
4. **Timing Data** -- How long each test took
5. **Edge Case Summary** -- List of adversarial/edge inputs tested and their outcomes

## Minimum Coverage Guidance

Each acceptance criterion should have at least 3 tests covering distinct scenarios:
- **Happy path**: Valid input produces the correct result
- **Error case**: Invalid or missing input produces the correct error
- **Edge / adversarial case**: Boundary values, injection payloads, or unusual inputs are handled safely

Some ACs will naturally require more than 3 tests. Security-related ACs (input validation, injection prevention, authentication) typically need 4 or more tests to cover the attack surface adequately. Consult the project's acceptance criteria document for specific requirements.
