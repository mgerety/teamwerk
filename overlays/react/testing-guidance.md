# React -- Testing Guidance

> Stack overlay for the Test Engineer. This supplements the generic role with React-specific testing patterns, setup, and conventions.

---

## Test Stack

React projects in this team typically use:
- **Playwright** for E2E browser tests (primary for evidence generation)
- **React Testing Library** for component-level tests (if configured)
- **Jest** or **Vitest** as the unit test runner (if configured)
- **Mock Service Worker (MSW)** for API mocking in component tests (if configured)

Playwright E2E tests are always required. Component tests are a bonus.

---

## Project Structure

```
tests/
  e2e/
    task-crud.spec.js         -- UI workflow tests
    xss-prevention.spec.js    -- XSS security tests
    styling.spec.js           -- Visual/layout tests
    empty-state.spec.js       -- Empty state handling
  evidence/                   -- Screenshots
  report/                     -- HTML evidence report
src/
  components/
    __tests__/                -- Component tests (co-located)
      TaskList.test.jsx
      TaskForm.test.jsx
    TaskList.jsx
    TaskForm.jsx
playwright.config.js
```

---

## E2E Testing with Playwright

### Configuration

```js
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',  // Or 5173 for Vite dev server
  },
  webServer: {
    command: 'npm start',              // Or 'npm run dev' for Vite
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Finding React-Rendered Elements

React renders to the DOM, so Playwright interacts with the actual HTML output. Use these strategies:

```js
// By data-testid (most reliable)
await page.locator('[data-testid="task-list"]').waitFor({ state: 'visible' });

// By role (accessible and readable)
await page.getByRole('button', { name: 'Add Task' }).click();
await page.getByRole('heading', { name: 'My Tasks' }).isVisible();

// By label (for form inputs)
await page.getByLabel('Title').fill('New task');

// By text content
await page.getByText('No tasks yet').isVisible();
```

### Waiting for React State Updates

React batches state updates and re-renders asynchronously. After triggering an action, wait for the DOM to reflect the change:

```js
// WRONG -- React may not have re-rendered yet
await page.click('#submit-btn');
const count = await page.locator('.task-item').count();

// RIGHT -- wait for the expected state
await page.click('#submit-btn');
await page.locator('.task-item').first().waitFor({ state: 'visible' });
const count = await page.locator('.task-item').count();
```

### Testing SPA Navigation

React Router changes the URL without a page reload. Use `waitForURL` to confirm navigation:

```js
await page.click('[data-testid="task-link"]');
await page.waitForURL('**/tasks/*');
await page.locator('[data-testid="task-detail"]').waitFor({ state: 'visible' });
```

### Testing Loading States

React apps often show loading indicators during API calls:

```js
// Verify loading state appears
await page.click('#submit-btn');
await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();

// Then verify it resolves
await page.locator('[data-testid="task-item"]').first().waitFor({ state: 'visible' });
await expect(page.locator('[data-testid="loading-spinner"]')).not.toBeVisible();
```

---

## Screenshot Evidence Pattern

Always assert BEFORE capturing the screenshot:

```js
test('AC-2: Displays empty state when no tasks exist', async ({ page }) => {
  await page.goto('/');

  const emptyState = page.locator('[data-testid="empty-state"]');
  await expect(emptyState).toBeVisible();
  await expect(emptyState).toContainText('No tasks');

  await page.screenshot({ path: 'tests/evidence/ac2-empty-state.png' });
});
```

### Full-Page vs. Element Screenshots

```js
// Full page -- good for layout evidence
await page.screenshot({ path: 'tests/evidence/ac8-page-layout.png', fullPage: true });

// Element only -- good for focused evidence
const modal = page.locator('[data-testid="confirm-dialog"]');
await modal.screenshot({ path: 'tests/evidence/ac4-confirm-modal.png' });
```

---

## Component Testing with React Testing Library

If the project has React Testing Library configured, use it for faster feedback on component behavior:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskForm from '../TaskForm';

test('AC-1: Shows error when submitting empty title', async () => {
  const mockSubmit = jest.fn();
  render(<TaskForm onSubmit={mockSubmit} />);

  await userEvent.click(screen.getByRole('button', { name: /add task/i }));

  expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
  expect(mockSubmit).not.toHaveBeenCalled();
});

test('AC-1: Calls onSubmit with trimmed title', async () => {
  const mockSubmit = jest.fn();
  render(<TaskForm onSubmit={mockSubmit} />);

  await userEvent.type(screen.getByLabelText('Title'), '  New task  ');
  await userEvent.click(screen.getByRole('button', { name: /add task/i }));

  expect(mockSubmit).toHaveBeenCalledWith({ title: 'New task' });
});
```

### Query Priority

React Testing Library queries in order of preference:

1. `getByRole` -- accessible role (button, heading, textbox)
2. `getByLabelText` -- form inputs with labels
3. `getByText` -- visible text content
4. `getByDisplayValue` -- current input value
5. `getByTestId` -- fallback for elements without accessible names

Use `queryBy*` when asserting an element does NOT exist:

```jsx
expect(screen.queryByText('Error')).not.toBeInTheDocument();
```

Use `findBy*` when waiting for async rendering:

```jsx
const item = await screen.findByText('New task');
expect(item).toBeInTheDocument();
```

---

## Mocking API Calls with MSW

If MSW is configured, use it for component tests that make API calls:

```js
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('/api/tasks', (req, res, ctx) => {
    return res(ctx.json([
      { id: '1', title: 'Mocked task', completed: false }
    ]));
  }),
  rest.post('/api/tasks', (req, res, ctx) => {
    return res(ctx.status(201), ctx.json({ id: '2', ...req.body }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## XSS Testing in React

React auto-escapes JSX, but test that the backend returns safe data and the frontend does not use `dangerouslySetInnerHTML`:

```js
test('AC-6: XSS script tag renders as text, not executed', async ({ page }) => {
  // Create a task with XSS payload via API
  const xssPayload = '<script>alert("xss")</script>';
  await createTaskViaApi(xssPayload);

  await page.goto('/');
  await page.locator('[data-testid="task-item"]').first().waitFor({ state: 'visible' });

  // The script tag should be visible as text, not executed
  const taskText = await page.locator('[data-testid="task-item"]').first().textContent();
  expect(taskText).not.toContain('<script>');

  // Verify no alert dialog appeared
  let alertFired = false;
  page.on('dialog', () => { alertFired = true; });
  expect(alertFired).toBe(false);

  await page.screenshot({ path: 'tests/evidence/ac6-xss-script-tag-safe.png' });
});
```

---

## Test File Naming

- E2E tests: `*.spec.js` or `*.spec.ts` (in `tests/e2e/`)
- Component tests: `*.test.jsx` or `*.test.tsx` (co-located with components)
- Helpers: no `.spec` or `.test` in the name

---

## Running Tests

```bash
# E2E tests only (Playwright)
npx playwright test

# Component/unit tests (Jest or Vitest)
npm test
# or
npx vitest run

# Specific E2E test file
npx playwright test tests/e2e/task-crud.spec.js

# With headed browser (debugging)
npx playwright test --headed

# Generate Playwright trace for debugging
npx playwright test --trace on
```

---

## Common Gotchas

1. **React hydration mismatches** -- In SSR apps (Next.js), Playwright may see a flash of server-rendered content before client hydration. Wait for interactive elements, not just visible text
2. **Strict mode double renders** -- React StrictMode renders components twice in development. This can cause duplicate API calls in dev but not production
3. **Stale element references** -- After a React re-render, old element references may be invalid. Always re-query after actions that cause state changes
4. **Portal-rendered modals** -- React portals render outside the component tree in the DOM. Playwright still finds them normally, but component tests need the portal container in the test DOM
5. **Environment variables** -- Vite requires `VITE_` prefix, CRA requires `REACT_APP_` prefix. Missing prefix means the variable is undefined at build time
6. **Hot reload interference** -- During E2E development, Vite HMR can cause unexpected page updates. Disable HMR in test mode or use a production build
7. **Act warnings in component tests** -- Wrap state-changing operations in `act()` or use `waitFor()` to avoid React testing warnings
