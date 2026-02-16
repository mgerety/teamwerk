# Express.js -- Testing Guidance

> Stack overlay for the Test Engineer. This supplements the generic role with Express-specific testing patterns, setup, and conventions.

---

## Test Stack

Express projects in this team use:
- **Playwright** as the test runner for both API and E2E tests
- **supertest** for API integration tests (HTTP assertions against the Express app)
- **Playwright browser APIs** for E2E browser tests

All test commands use `npx playwright test`.

---

## Project Structure

```
tests/
  api/                  -- API integration tests (supertest)
    tasks.spec.js       -- CRUD and validation tests
    auth.spec.js        -- Authentication endpoint tests
  e2e/                  -- E2E browser tests (Playwright)
    task-crud.spec.js   -- UI workflow tests
    xss.spec.js         -- XSS prevention tests
    styling.spec.js     -- Visual/layout tests
  evidence/             -- Screenshots captured during test runs
  report/               -- Generated HTML evidence report
  helpers/              -- Utilities (report generator, etc.)
playwright.config.js    -- Playwright configuration
```

---

## API Testing with Supertest

### Importing the App

Import the Express app directly -- do NOT start a separate server process:

```js
// tests/api/tasks.spec.js
const { test, expect } = require('@playwright/test');
const request = require('supertest');
const app = require('../../src/app');
```

**Critical**: The backend must export the app from `app.js` (not `server.js`). If it only exports from `server.js` with a listener already running, you get port conflicts.

### Basic CRUD Test Pattern

```js
test.describe('Tasks API', () => {
  let authToken;

  test.beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: 'testuser', password: 'testpass' });
    authToken = res.body.token;
  });

  test('AC-1: Creates task with valid title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Test task' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test task');
  });

  test('AC-1: Rejects empty title with 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
```

### Authentication Testing

```js
test('AC-7: Returns 401 without token', async () => {
  const res = await request(app)
    .get('/api/tasks');

  expect(res.status).toBe(401);
  expect(res.body.error).toBeDefined();
});

test('AC-7: Returns 401 with invalid token', async () => {
  const res = await request(app)
    .get('/api/tasks')
    .set('Authorization', 'Bearer invalid-token-here');

  expect(res.status).toBe(401);
});
```

### Adversarial Input Testing

```js
test('AC-5: Handles malformed JSON gracefully', async () => {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${authToken}`)
    .set('Content-Type', 'application/json')
    .send('{ invalid json }');

  expect(res.status).toBe(400);
  expect(res.body).toHaveProperty('error');
});

test('AC-6: Sanitizes XSS payload in title', async () => {
  const xssPayload = '<script>alert("xss")</script>';
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ title: xssPayload });

  expect(res.status).toBe(201);
  expect(res.body.title).not.toContain('<script>');
});

test('AC-5: Handles SQL injection string safely', async () => {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ title: "'; DROP TABLE tasks; --" });

  // Should either create successfully (with escaped content) or reject -- NOT crash
  expect([201, 400]).toContain(res.status);
});
```

---

## E2E Testing with Playwright

### Server Lifecycle

Start the server before E2E tests and stop it after. Use the Playwright `webServer` config or manage manually:

```js
// playwright.config.js
module.exports = {
  webServer: {
    command: 'node src/server.js',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3000',
  },
};
```

### Manual Server Management (alternative)

```js
const { test, expect } = require('@playwright/test');
const app = require('../../src/app');

let server;

test.beforeAll(async () => {
  server = app.listen(0); // Port 0 = random available port
  const port = server.address().port;
  // Store baseURL for use in tests
});

test.afterAll(async () => {
  if (server) server.close();
});
```

### E2E Test Pattern

```js
test('AC-2: Displays task list on page load', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid="task-list"]', { state: 'visible' });

  const tasks = page.locator('[data-testid="task-item"]');
  // Assert based on expected state, not hardcoded count
  await expect(tasks.first()).toBeVisible();

  await page.screenshot({ path: 'tests/evidence/ac2-task-list-rendered.png' });
});
```

### Screenshot Pattern

Always assert BEFORE taking the screenshot. The screenshot is evidence of verified state:

```js
// CORRECT -- assert first, then capture evidence
const modal = page.locator('[data-testid="confirm-dialog"]');
await expect(modal).toBeVisible();
await expect(modal.locator('.confirm-message')).toContainText('Are you sure');
await page.screenshot({ path: 'tests/evidence/ac4-delete-confirmation-modal.png' });

// WRONG -- screenshot without assertion proves nothing
await page.screenshot({ path: 'tests/evidence/ac4-something.png' });
```

### State-Based Navigation

```js
// WRONG -- hardcoded wait
await page.click('#create-btn');
await page.waitForTimeout(2000);

// RIGHT -- wait for the result of the action
await page.click('#create-btn');
await page.waitForSelector('[data-testid="task-item"]', { state: 'visible' });
```

### Filling Forms

```js
test('AC-1: Creates task through the UI', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#task-form', { state: 'visible' });

  await page.fill('#title-input', 'New task from E2E test');
  await page.click('#submit-btn');

  // Wait for the new item to appear in the list
  const newTask = page.locator('[data-testid="task-item"]', {
    hasText: 'New task from E2E test'
  });
  await expect(newTask).toBeVisible();

  await page.screenshot({ path: 'tests/evidence/ac1-task-created.png' });
});
```

---

## Common Assertions

### API Assertions (supertest)

```js
expect(res.status).toBe(201);              // Status code
expect(res.body).toHaveProperty('id');     // Property exists
expect(res.body.title).toBe('Expected');   // Exact value
expect(res.body.error).toBeDefined();      // Error present
expect(res.headers['content-type']).toMatch(/json/);  // Content type
```

### E2E Assertions (Playwright)

```js
await expect(page.locator('#title')).toBeVisible();
await expect(page.locator('#title')).toHaveText('Expected Title');
await expect(page.locator('#title')).toContainText('partial');
await expect(page.locator('.item')).toHaveCount(3);
await expect(page.locator('.completed')).toHaveCSS('text-decoration-line', 'line-through');
```

---

## Test Configuration

### Playwright Config for Express Projects

```js
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node src/server.js',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'e2e', testDir: './tests/e2e', use: { browserName: 'chromium' } },
  ],
});
```

---

## Common Gotchas

1. **Port conflicts** -- If the server is already running, supertest will fail to bind. Use the `app` export, not the `server` export
2. **Async cleanup** -- Always close the server in `afterAll` to avoid hanging test processes
3. **Shared state** -- In-memory stores persist across tests in the same suite. Create and delete test data per test, or reset state in `beforeEach`
4. **Cookie/session leaks** -- Use a fresh supertest agent per test if using session-based auth
5. **Screenshot paths** -- Use `tests/evidence/` with AC-prefixed filenames: `ac1-task-created.png`
6. **JSON content type** -- supertest `.send()` automatically sets `Content-Type: application/json`, but if you send a raw string you must set it manually
7. **Playwright + supertest in same file** -- Both work under the Playwright test runner, but supertest tests do not need a `page` fixture. Use `test()` without destructuring `{ page }`
