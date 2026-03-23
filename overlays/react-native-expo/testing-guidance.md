# React Native + Expo -- Testing Guidance

> Stack overlay for the Test Engineer. This supplements the generic role with React Native and Expo-specific testing patterns, setup, and conventions.

---

## Test Stack

React Native + Expo projects should prefer this stack order:
1. **Maestro** for E2E testing — YAML-based flows, simpler setup, less room for garbage tests, per-scenario file pattern
2. **Jest** for unit tests (included with Expo by default)
3. **React Native Testing Library** for component tests

If the project's `teamwerk-config.yml` specifies `testing.e2e.framework`, use that. Otherwise, prefer Maestro for new E2E test setups.

---

## Project Structure

```
tests/
  e2e/
    flows/                     -- Maestro flows
      create-task.yaml
      delete-task.yaml
  evidence/                    -- Screenshots
  report/                      -- HTML evidence report
src/
  components/
    __tests__/                 -- Component tests
      TaskList.test.tsx
      TaskForm.test.tsx
  hooks/
    __tests__/
      useTasks.test.ts
jest.config.js                 -- or in package.json
```

---

## E2E Testing with Maestro

### Setup

Install Maestro CLI:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Maestro Flow Files

```yaml
# tests/e2e/flows/create-task.yaml
appId: com.myapp.tasks
---
- launchApp

- tapOn:
    id: "title-input"
- inputText: "New task from Maestro"
- tapOn:
    id: "submit-btn"

# Wait for the item to appear
- assertVisible:
    text: "New task from Maestro"

- takeScreenshot: tests/evidence/ac1-task-created
```

```yaml
# tests/e2e/flows/delete-task.yaml
appId: com.myapp.tasks
---
- launchApp

# Tap delete on first task item
- tapOn:
    id: "delete-btn"
    index: 0

# Verify confirmation dialog
- assertVisible:
    id: "confirm-dialog"

- takeScreenshot: tests/evidence/ac4-delete-confirmation

# Confirm deletion
- tapOn:
    id: "confirm-btn"

- assertNotVisible:
    id: "confirm-dialog"

- takeScreenshot: tests/evidence/ac4-after-deletion
```

### Maestro Assertions

```yaml
- assertVisible:
    id: "task-list"

- assertVisible:
    text: "No tasks yet"

- assertNotVisible:
    id: "loading-spinner"

# Wait with custom timeout
- extendedWaitUntil:
    visible:
      id: "task-item"
    timeout: 10000
```

### Running Maestro Tests

```bash
# Run a single flow
maestro test tests/e2e/flows/create-task.yaml

# Run all flows in a directory
maestro test tests/e2e/flows/

# Record a test interactively
maestro record
```

---

### Maestro Best Practices (Required)

**Per-scenario file pattern.** Each test scenario is its own YAML file with comment headers:
```yaml
# Test: Screen Renders
# AC: AC-1
# Purpose: Verify the login screen displays all expected elements
# Expected: Username field, password field, and Continue button visible
# Preconditions: App launched, not logged in
appId: com.myapp
---
- launchApp
- assertVisible:
    id: "username-input"
- assertVisible:
    id: "password-input"
- assertVisible:
    text: "CONTINUE"
- takeScreenshot: evidence/ac1-login-screen-renders
```

**Conditional flow pattern.** Tests must handle whatever state the device is in:
```yaml
- runFlow:
    when:
      visible: "CONTINUE"
    commands:
      - tapOn: "CONTINUE"
```

**`clearState` is FORBIDDEN.** Tests must NEVER wipe app data. If a test needs a clean state, it must navigate to that state through the UI or use a reusable flow. The `clearState` flag destroys real user scenarios and hides bugs.

**Evidence report generation is mandatory.** After E2E tests run, generate the evidence report using the command from `testing.e2e.report_command` in the project config. If no command is configured, tell the Team Lead that evidence report generation is not set up.

---

## Component Testing with React Native Testing Library

### Setup

```bash
npx expo install @testing-library/react-native @testing-library/jest-native
```

### Component Test Pattern

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import TaskForm from '../TaskForm';

test('AC-1: Shows error when submitting empty title', async () => {
  const mockSubmit = jest.fn();
  render(<TaskForm onSubmit={mockSubmit} />);

  fireEvent.press(screen.getByTestId('submit-btn'));

  await waitFor(() => {
    expect(screen.getByTestId('error-message')).toHaveTextContent('Title is required');
  });

  expect(mockSubmit).not.toHaveBeenCalled();
});

test('AC-1: Calls onSubmit with trimmed title', async () => {
  const mockSubmit = jest.fn().mockResolvedValue(undefined);
  render(<TaskForm onSubmit={mockSubmit} />);

  fireEvent.changeText(screen.getByTestId('title-input'), '  New task  ');
  fireEvent.press(screen.getByTestId('submit-btn'));

  await waitFor(() => {
    expect(mockSubmit).toHaveBeenCalledWith({ title: 'New task' });
  });
});
```

### Query Methods

```tsx
// By testID (most common in React Native)
screen.getByTestId('task-list')

// By text
screen.getByText('My Tasks')

// By role + name
screen.getByRole('button', { name: 'Add Task' })

// By accessibility label
screen.getByLabelText('Task title')

// Query variant (returns null if not found)
screen.queryByTestId('error-message')

// Find variant (async, waits for element)
await screen.findByTestId('task-item')
```

### Mocking Native Modules

```tsx
// jest.setup.js or at top of test file
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('mock-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn().mockReturnValue({}),
  Link: ({ children }) => children,
}));
```

---

## Jest Configuration for Expo

Expo includes Jest configuration by default. Extend in `package.json` or `jest.config.js`:

```json
{
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterSetup": ["./jest.setup.js"],
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)"
    ]
  }
}
```

**Gotcha**: The `transformIgnorePatterns` is critical. Many React Native packages ship untranspiled ES modules that Jest cannot parse without transformation.

---

## Screenshot Evidence

### Maestro

```yaml
- takeScreenshot: tests/evidence/ac1-task-created
# Saves as .png in the specified path
```

### Component Tests (snapshot)

```tsx
// Visual snapshot (not the same as screenshot evidence, but useful)
const tree = render(<TaskList tasks={mockTasks} />);
expect(tree.toJSON()).toMatchSnapshot();
```

**Note**: Jest snapshots are NOT the same as screenshot evidence. E2E screenshots from Maestro are required for the evidence report.

---

## Platform-Specific Test Considerations

### Running on Both Platforms

```bash
# Maestro (automatically uses connected device/emulator)
maestro test flows/

# Jest (platform-independent)
npx jest
```

---

## Test File Naming

- Maestro flows: `*.yaml`
- Component tests: `*.test.tsx` or `*.test.ts`
- Unit tests: `*.test.ts`
- Jest setup: `jest.setup.js` or `jest.setup.ts`

---

## Running Tests

```bash
# Jest (unit + component)
npx jest
npx jest --watch
npx jest TaskForm.test.tsx

# Maestro E2E
maestro test tests/e2e/flows/create-task.yaml
maestro test tests/e2e/flows/
```

---

## Common Gotchas

1. **`testID` not `data-testid`** -- React Native uses `testID` prop. RNTL queries by it
2. **`transformIgnorePatterns`** -- Jest fails on React Native packages that ship ES modules. The patterns list must include all such packages
3. **Maestro requires a running app** -- Maestro connects to an already-running app on a device/emulator
4. **Async state updates** -- Use `waitFor` in RNTL to handle async rendering. Never use `setTimeout` or `sleep`
5. **Mock native modules** -- Many Expo modules use native code that Jest cannot run. Mock them in `jest.setup.js`
6. **FlatList rendering** -- FlatList virtualizes items. In tests, only visible items are rendered. Scroll to find off-screen items in E2E tests
7. **Keyboard in E2E** -- On device/emulator, the software keyboard can obscure elements. Scroll before tapping
8. **Screenshot paths** -- Maestro saves to the path you specify. Ensure evidence lands in `tests/evidence/` for the report
