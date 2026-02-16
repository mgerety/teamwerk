# React Native + Expo -- Testing Guidance

> Stack overlay for the Test Engineer. This supplements the generic role with React Native and Expo-specific testing patterns, setup, and conventions.

---

## Test Stack

React Native + Expo projects in this team can use:
- **Detox** for E2E device/emulator testing (most capable)
- **Maestro** for E2E testing with YAML-based flows (simpler setup)
- **React Native Testing Library** for component tests
- **Jest** for unit tests (included with Expo by default)

Choose based on what the project already has configured. If nothing is configured, Maestro is the easiest to set up, Jest + RNTL is the fastest to run.

---

## Project Structure

```
tests/
  e2e/
    flows/                     -- Maestro flows (if using Maestro)
      create-task.yaml
      delete-task.yaml
    specs/                     -- Detox specs (if using Detox)
      taskCrud.e2e.ts
      xssPrevention.e2e.ts
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
.detoxrc.js                    -- Detox config (if using Detox)
```

---

## E2E Testing with Detox

### Setup

Detox requires a built app binary. Configure in `.detoxrc.js`:

```js
module.exports = {
  testRunner: {
    args: {
      config: 'e2e/jest.config.js',
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_4_API_34' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
};
```

### Detox Test Pattern

```ts
describe('Task CRUD', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('AC-1: Creates task with valid title', async () => {
    await element(by.id('title-input')).typeText('New task from Detox');
    await element(by.id('submit-btn')).tap();

    // Wait for the new item to appear
    await waitFor(element(by.text('New task from Detox')))
      .toBeVisible()
      .withTimeout(5000);

    // Take screenshot as evidence
    await device.takeScreenshot('ac1-task-created');
  });

  it('AC-1: Shows error for empty title submission', async () => {
    await element(by.id('submit-btn')).tap();

    await waitFor(element(by.id('error-message')))
      .toBeVisible()
      .withTimeout(3000);

    await expect(element(by.id('error-message'))).toHaveText('Title is required');
    await device.takeScreenshot('ac1-empty-title-error');
  });

  it('AC-4: Shows confirmation dialog before deletion', async () => {
    // Tap delete on first item
    await element(by.id('delete-btn')).atIndex(0).tap();

    // Verify dialog appears
    await waitFor(element(by.id('confirm-dialog')))
      .toBeVisible()
      .withTimeout(3000);

    await device.takeScreenshot('ac4-delete-confirmation');

    // Confirm deletion
    await element(by.id('confirm-btn')).tap();

    await waitFor(element(by.id('confirm-dialog')))
      .not.toBeVisible()
      .withTimeout(3000);
  });
});
```

### Detox Element Matchers

```ts
// By testID
element(by.id('task-list'))

// By text content
element(by.text('My Tasks'))

// By label (accessibility)
element(by.label('Add task button'))

// Indexed (when multiple matches)
element(by.id('task-item')).atIndex(0)

// Descendant matching
element(by.id('error-message').withAncestor(by.id('task-form')))
```

### Detox Assertions

```ts
await expect(element(by.id('task-list'))).toBeVisible();
await expect(element(by.id('task-list'))).not.toBeVisible();
await expect(element(by.id('title-input'))).toHaveText('Expected text');
await expect(element(by.id('task-item'))).toExist();
```

### Detox Waiting (state-based, NOT hardcoded)

```ts
// WRONG -- hardcoded timeout
await new Promise(resolve => setTimeout(resolve, 3000));

// RIGHT -- state-based waiting
await waitFor(element(by.id('task-item')))
  .toBeVisible()
  .withTimeout(5000);

// Wait for element to disappear
await waitFor(element(by.id('loading-spinner')))
  .not.toBeVisible()
  .withTimeout(10000);
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

### Detox

```ts
// Named screenshot
await device.takeScreenshot('ac1-task-created');
// Saved to artifacts directory configured in .detoxrc.js
```

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

**Note**: Jest snapshots are NOT the same as screenshot evidence. E2E screenshots from Detox or Maestro are required for the evidence report.

---

## Platform-Specific Test Considerations

### Running on Both Platforms

```bash
# Detox
detox test --configuration ios.sim.debug
detox test --configuration android.emu.debug

# Maestro (automatically uses connected device/emulator)
maestro test flows/

# Jest (platform-independent)
npx jest
```

### Platform-Specific Assertions

Some behaviors differ between iOS and Android:

```ts
// Detox: platform-conditional assertions
if (device.getPlatform() === 'ios') {
  await expect(element(by.id('date-picker'))).toBeVisible();
} else {
  // Android date picker has different structure
  await expect(element(by.id('date-picker-android'))).toBeVisible();
}
```

---

## Test File Naming

- Detox E2E: `*.e2e.ts` or `*.e2e.js`
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

# Detox E2E
detox build --configuration ios.sim.debug
detox test --configuration ios.sim.debug

# Maestro E2E
maestro test tests/e2e/flows/create-task.yaml
maestro test tests/e2e/flows/
```

---

## Common Gotchas

1. **`testID` not `data-testid`** -- React Native uses `testID` prop. Both Detox and RNTL query by it
2. **`transformIgnorePatterns`** -- Jest fails on React Native packages that ship ES modules. The patterns list must include all such packages
3. **Detox build required** -- Detox tests run against a compiled binary, not a dev server. You must `detox build` before `detox test`
4. **Maestro requires a running app** -- Unlike Detox, Maestro connects to an already-running app on a device/emulator
5. **Async state updates** -- Use `waitFor` in both Detox and RNTL to handle async rendering. Never use `setTimeout` or `sleep`
6. **Mock native modules** -- Many Expo modules use native code that Jest cannot run. Mock them in `jest.setup.js`
7. **FlatList rendering** -- FlatList virtualizes items. In tests, only visible items are rendered. Scroll to find off-screen items in E2E tests
8. **Keyboard in E2E** -- On device/emulator, the software keyboard can obscure elements. Use `device.disableSynchronization()` in Detox or scroll before tapping
9. **Screenshot paths** -- Detox saves to its configured artifacts directory. Maestro saves to the path you specify. Ensure evidence lands in `tests/evidence/` for the report
