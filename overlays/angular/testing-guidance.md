# Angular -- Testing Guidance

> Stack overlay for the Test Engineer. This supplements the generic role with Angular-specific testing patterns, setup, and conventions.

---

## Test Stack

Angular projects in this team use:
- **Playwright** for E2E browser tests (primary for evidence generation)
- **Karma + Jasmine** for unit/component tests (Angular CLI default)
- **Jest** as an alternative unit test runner (if configured via `jest.config.js`)

Playwright E2E tests are always required. Component tests via Karma/Jest are a bonus.

---

## Project Structure

```
tests/
  e2e/
    task-crud.spec.ts         -- E2E workflow tests (Playwright)
    xss-prevention.spec.ts
    styling.spec.ts
  evidence/                   -- Screenshots
  report/                     -- HTML evidence report
src/
  app/
    components/
      task-list/
        task-list.component.spec.ts    -- Component test (co-located)
      task-form/
        task-form.component.spec.ts
    services/
      task.service.spec.ts             -- Service test (co-located)
playwright.config.ts
karma.conf.js                          -- Karma config (if present)
```

---

## E2E Testing with Playwright

### Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4200',
  },
  webServer: {
    command: 'ng serve',          // Or 'npm start'
    port: 4200,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,               // Angular builds can be slow
  },
});
```

**Note**: Angular's dev server startup is slower than Express or Vite. Set a generous `timeout` for the `webServer`.

### Finding Angular-Rendered Elements

Angular renders to the DOM like any other framework. Playwright interacts with the final HTML:

```typescript
// By data-testid (most reliable)
await page.locator('[data-testid="task-list"]').waitFor({ state: 'visible' });

// By role
await page.getByRole('button', { name: 'Add Task' }).click();

// By label (reactive form inputs)
await page.getByLabel('Title').fill('New task');

// By Angular-specific attributes (less preferred but sometimes useful)
await page.locator('app-task-list').waitFor({ state: 'visible' });
```

### Waiting for Angular Rendering

Angular's change detection runs asynchronously. After user actions, wait for the DOM to update:

```typescript
// WRONG -- Angular may not have finished change detection
await page.click('#submit-btn');
const count = await page.locator('.task-item').count();

// RIGHT -- wait for the expected DOM state
await page.click('#submit-btn');
await page.locator('.task-item').first().waitFor({ state: 'visible' });
```

### Testing Angular Router Navigation

Angular's router updates the URL without a full page reload:

```typescript
await page.click('[data-testid="task-link"]');
await page.waitForURL('**/tasks/*');
await page.locator('[data-testid="task-detail"]').waitFor({ state: 'visible' });
```

---

## E2E Test Patterns

### Form Submission

```typescript
test('AC-1: Creates task through the form', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid="task-form"]', { state: 'visible' });

  await page.getByLabel('Title').fill('New task from E2E');
  await page.getByRole('button', { name: 'Add Task' }).click();

  // Wait for the new item to appear
  const newTask = page.locator('[data-testid="task-item"]', {
    hasText: 'New task from E2E',
  });
  await expect(newTask).toBeVisible();

  await page.screenshot({ path: 'tests/evidence/ac1-task-created.png' });
});
```

### Validation Error Display

```typescript
test('AC-1: Shows validation error for empty title', async ({ page }) => {
  await page.goto('/');

  // Submit empty form
  await page.getByRole('button', { name: 'Add Task' }).click();

  // Angular reactive forms show errors after touch
  const errorMsg = page.locator('[role="alert"]');
  await expect(errorMsg).toBeVisible();
  await expect(errorMsg).toContainText('required');

  await page.screenshot({ path: 'tests/evidence/ac1-empty-title-error.png' });
});
```

### Modal/Dialog Testing

```typescript
test('AC-4: Shows confirmation dialog before deletion', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid="task-item"]').first().waitFor({ state: 'visible' });

  // Click delete button
  await page.locator('[data-testid="delete-btn"]').first().click();

  // Verify modal appears
  const dialog = page.locator('[data-testid="confirm-dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.confirm-message')).toContainText('Are you sure');

  await page.screenshot({ path: 'tests/evidence/ac4-delete-confirmation.png' });

  // Confirm deletion
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog).not.toBeVisible();
});
```

### Screenshot Evidence Pattern

Always assert before capturing:

```typescript
// CORRECT
const emptyState = page.locator('[data-testid="empty-state"]');
await expect(emptyState).toBeVisible();
await expect(emptyState).toContainText('No tasks');
await page.screenshot({ path: 'tests/evidence/ac2-empty-state.png' });

// WRONG -- screenshot without assertion
await page.screenshot({ path: 'tests/evidence/ac2-something.png' });
```

---

## Component Testing with Karma/Jasmine

### TestBed Configuration

```typescript
describe('TaskListComponent', () => {
  let component: TaskListComponent;
  let fixture: ComponentFixture<TaskListComponent>;
  let mockTaskService: jasmine.SpyObj<TaskService>;

  beforeEach(async () => {
    mockTaskService = jasmine.createSpyObj('TaskService', ['getTasks', 'deleteTask']);
    mockTaskService.getTasks.and.returnValue(of([
      { id: '1', title: 'Test task', completed: false },
    ]));

    await TestBed.configureTestingModule({
      imports: [TaskListComponent],  // standalone component
      providers: [
        { provide: TaskService, useValue: mockTaskService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('AC-2: should display tasks from the service', () => {
    const items = fixture.debugElement.queryAll(By.css('[data-testid="task-item"]'));
    expect(items.length).toBe(1);
    expect(items[0].nativeElement.textContent).toContain('Test task');
  });
});
```

### Testing Reactive Forms

```typescript
describe('TaskFormComponent', () => {
  let component: TaskFormComponent;
  let fixture: ComponentFixture<TaskFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskFormComponent, ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('AC-1: should show required error when title is empty and touched', () => {
    const titleControl = component.form.get('title')!;
    titleControl.markAsTouched();
    fixture.detectChanges();

    const error = fixture.debugElement.query(By.css('[role="alert"]'));
    expect(error.nativeElement.textContent).toContain('required');
  });

  it('AC-1: should disable submit when form is invalid', () => {
    const button = fixture.debugElement.query(By.css('#submit-btn'));
    expect(button.nativeElement.disabled).toBeTrue();
  });
});
```

### Testing HTTP Services

```typescript
describe('TaskService', () => {
  let service: TaskService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TaskService],
    });

    service = TestBed.inject(TaskService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();  // Ensure no outstanding requests
  });

  it('AC-2: should fetch tasks from the API', () => {
    const mockTasks = [{ id: '1', title: 'Test', completed: false }];

    service.getTasks().subscribe(tasks => {
      expect(tasks).toEqual(mockTasks);
    });

    const req = httpMock.expectOne('/api/tasks');
    expect(req.request.method).toBe('GET');
    req.flush(mockTasks);
  });
});
```

---

## Spying and Mocking

### Jasmine Spies

```typescript
// Spy on a service method
const spy = spyOn(taskService, 'createTask').and.returnValue(of(mockTask));

// Verify it was called
expect(spy).toHaveBeenCalledWith({ title: 'New task' });
expect(spy).toHaveBeenCalledTimes(1);

// Spy that rejects
spyOn(taskService, 'createTask').and.returnValue(throwError(() => new Error('Failed')));
```

### Creating Mock Objects

```typescript
const mockRouter = jasmine.createSpyObj('Router', ['navigate']);
const mockTaskService = jasmine.createSpyObj('TaskService', ['getTasks', 'createTask']);

// Provide in TestBed
providers: [
  { provide: Router, useValue: mockRouter },
  { provide: TaskService, useValue: mockTaskService },
]
```

---

## Test File Naming

- E2E tests: `*.spec.ts` (in `tests/e2e/`)
- Component tests: `*.component.spec.ts` (co-located with component)
- Service tests: `*.service.spec.ts` (co-located with service)
- Guard tests: `*.guard.spec.ts`

---

## Running Tests

```bash
# E2E tests (Playwright)
npx playwright test

# Unit/component tests (Karma)
ng test
ng test --watch=false    # Single run (CI mode)
ng test --code-coverage  # With coverage report

# Unit tests (Jest, if configured)
npx jest

# Specific test file
ng test --include='**/task-list.component.spec.ts'
npx playwright test tests/e2e/task-crud.spec.ts
```

---

## Common Gotchas

1. **TestBed async setup** -- Always use `async/await` with `TestBed.configureTestingModule()` and `compileComponents()` for components with external templates
2. **Change detection** -- Call `fixture.detectChanges()` after any data change to trigger Angular's change detection in tests. Without it, the DOM will not update
3. **OnPush components** -- Components with `ChangeDetectionStrategy.OnPush` require `fixture.detectChanges()` or `markForCheck()` after input changes
4. **Observable subscriptions in tests** -- Use `fakeAsync` and `tick()` to control async timing in Karma tests
5. **Angular dev server startup time** -- `ng serve` can take 15-30 seconds. Set Playwright's `webServer.timeout` to at least 60000ms
6. **Standalone vs NgModule** -- Standalone components import dependencies directly. NgModule components inherit from the module. TestBed config differs accordingly
7. **HttpTestingController** -- Always call `httpMock.verify()` in `afterEach` to ensure no unmatched HTTP requests
8. **Zone.js in E2E** -- Playwright does not need Protractor's `waitForAngular()`. Standard Playwright selectors and waits work fine with Angular apps
