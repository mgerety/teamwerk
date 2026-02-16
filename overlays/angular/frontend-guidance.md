# Angular -- Frontend Build Guidance

> Stack overlay for the Frontend Builder. This supplements the generic role with Angular-specific patterns, conventions, and gotchas.

---

## Stack Discovery

Detect Angular by the presence of `angular.json` in the project root. Key indicators:

| File | Purpose |
|---|---|
| `angular.json` | Workspace configuration |
| `tsconfig.json` | TypeScript config |
| `src/main.ts` | Bootstrap entry point |
| `src/app/app.module.ts` | Root NgModule (traditional) |
| `src/app/app.component.ts` | Root component (standalone) |
| `src/app/app.routes.ts` | Route definitions (standalone) |

Check the Angular version in `package.json` under `@angular/core`. Angular 17+ uses standalone components by default.

---

## Project Structure

### Traditional (NgModule-based)

```
src/
  app/
    app.module.ts
    app.component.ts
    app.component.html
    app.component.scss
    app-routing.module.ts
    components/
      task-list/
        task-list.component.ts
        task-list.component.html
        task-list.component.scss
        task-list.component.spec.ts
      task-form/
      confirm-dialog/
    services/
      task.service.ts
      auth.service.ts
    models/
      task.model.ts
    guards/
      auth.guard.ts
    interceptors/
      auth.interceptor.ts
  environments/
    environment.ts
    environment.prod.ts
```

### Standalone (Angular 17+)

```
src/
  app/
    app.component.ts          -- standalone root component
    app.routes.ts              -- route definitions
    app.config.ts              -- application config (providers)
    components/
      task-list.component.ts   -- standalone component (template inline or separate)
      task-form.component.ts
      confirm-dialog.component.ts
    services/
      task.service.ts
      auth.service.ts
```

Use whichever pattern the project already follows.

---

## Components

### Standalone Component (Angular 17+)

```typescript
@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule, TaskItemComponent],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskListComponent {
  tasks = input<Task[]>([]);
  onComplete = output<string>();
  onDelete = output<string>();
}
```

### NgModule Component (traditional)

```typescript
@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss'],
})
export class TaskListComponent {
  @Input() tasks: Task[] = [];
  @Output() complete = new EventEmitter<string>();
  @Output() delete = new EventEmitter<string>();
}
```

### Component Naming

Angular CLI convention: kebab-case filenames, PascalCase class names.

- `task-list.component.ts` contains `TaskListComponent`
- `auth.service.ts` contains `AuthService`
- `auth.guard.ts` contains `AuthGuard`

Generate components with the CLI when possible:

```bash
ng generate component components/task-list
ng generate service services/task
```

---

## Services and Dependency Injection

### Service Pattern

```typescript
@Injectable({
  providedIn: 'root',  // Singleton, available app-wide
})
export class TaskService {
  private apiUrl = '/api/tasks';

  constructor(private http: HttpClient) {}

  getTasks(): Observable<Task[]> {
    return this.http.get<Task[]>(this.apiUrl);
  }

  createTask(task: Partial<Task>): Observable<Task> {
    return this.http.post<Task>(this.apiUrl, task);
  }

  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  updateTask(id: string, updates: Partial<Task>): Observable<Task> {
    return this.http.put<Task>(`${this.apiUrl}/${id}`, updates);
  }
}
```

### Using Services in Components

```typescript
export class TaskListComponent implements OnInit {
  tasks: Task[] = [];
  error: string | null = null;

  constructor(private taskService: TaskService) {}

  ngOnInit(): void {
    this.taskService.getTasks().subscribe({
      next: (tasks) => this.tasks = tasks,
      error: (err) => this.error = err.error?.error || 'Failed to load tasks',
    });
  }
}
```

---

## Routing

### Standalone Routes (Angular 17+)

```typescript
// app.routes.ts
export const routes: Routes = [
  { path: '', component: TaskListComponent },
  { path: 'tasks/:id', component: TaskDetailComponent },
  { path: '**', component: NotFoundComponent },
];
```

### Lazy Loading

```typescript
{
  path: 'admin',
  loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent),
}
```

### Route Guards

```typescript
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  if (authService.isAuthenticated()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login']);
};
```

---

## Forms (Reactive Forms)

Always prefer Reactive Forms over Template-driven Forms for testability:

```typescript
export class TaskFormComponent {
  form: FormGroup;
  submitError: string | null = null;

  constructor(private fb: FormBuilder, private taskService: TaskService) {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', [Validators.maxLength(2000)]],
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.taskService.createTask(this.form.value).subscribe({
      next: () => {
        this.form.reset();
        this.submitError = null;
      },
      error: (err) => {
        this.submitError = err.error?.error || 'Failed to create task';
      },
    });
  }

  get titleError(): string | null {
    const control = this.form.get('title');
    if (control?.hasError('required') && control.touched) return 'Title is required';
    if (control?.hasError('maxlength')) return 'Title must be 200 characters or fewer';
    return null;
  }
}
```

Template:

```html
<form [formGroup]="form" (ngSubmit)="onSubmit()" data-testid="task-form">
  <label for="title-input">Title</label>
  <input id="title-input" formControlName="title" />
  <span *ngIf="titleError" class="error" role="alert">{{ titleError }}</span>

  <button type="submit" [disabled]="form.invalid" id="submit-btn">Add Task</button>
  <span *ngIf="submitError" class="error" role="alert">{{ submitError }}</span>
</form>
```

---

## HTTP Interceptors

### Auth Interceptor (functional, Angular 17+)

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req);
};
```

Register in app config:

```typescript
provideHttpClient(withInterceptors([authInterceptor]))
```

---

## RxJS Patterns

### Common Operators

```typescript
// Transform HTTP response
this.http.get<Task[]>('/api/tasks').pipe(
  map(tasks => tasks.filter(t => !t.completed)),
  catchError(err => {
    console.error('Failed to load tasks', err);
    return of([]);  // Return empty array on error
  })
);
```

### Unsubscribe Pattern

Use `takeUntilDestroyed()` (Angular 16+) or manual cleanup:

```typescript
export class TaskListComponent {
  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.taskService.getTasks().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(tasks => this.tasks = tasks);
  }
}
```

---

## Confirmation Dialog

```typescript
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div class="modal-overlay" *ngIf="isOpen" data-testid="confirm-dialog"
         (click)="onCancel()" (keydown.escape)="onCancel()">
      <div class="modal-content" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <p class="confirm-message">{{ message }}</p>
        <div class="modal-actions">
          <button (click)="onCancel()">Cancel</button>
          <button (click)="onConfirm()" class="btn-danger">Confirm</button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  @Input() isOpen = false;
  @Input() message = 'Are you sure?';
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm(): void { this.confirm.emit(); }
  onCancel(): void { this.cancel.emit(); }
}
```

---

## XSS Prevention

Angular templates auto-escape interpolated values by default:

```html
<!-- SAFE -- Angular escapes this -->
<span>{{ task.title }}</span>

<!-- DANGEROUS -- bypasses escaping -->
<span [innerHTML]="task.title"></span>
```

**Rule**: Never bind user-provided data with `[innerHTML]`. If HTML rendering is required, use Angular's `DomSanitizer` to sanitize first.

---

## Testability

Add `data-testid` attributes and use semantic HTML:

```html
<ul data-testid="task-list">
<li data-testid="task-item">
<form data-testid="task-form">
<div data-testid="confirm-dialog" role="dialog">
<div data-testid="empty-state">
```

---

## UI Library Detection

Check `package.json` and `angular.json` for:
- **Angular Material**: `@angular/material` -- use `mat-*` components
- **PrimeNG**: `primeng` -- use `p-*` components
- **NgBootstrap**: `@ng-bootstrap/ng-bootstrap` -- use `ngb-*` components

Use the existing library. Do not introduce a new one.

---

## Common Gotchas

1. **Zone.js and change detection** -- Angular uses Zone.js to detect async operations. If using `OnPush` change detection, you must explicitly trigger updates with `markForCheck()` or use `async` pipe
2. **Observable subscriptions** -- Always unsubscribe to prevent memory leaks. Use `takeUntilDestroyed()`, `async` pipe, or manual `unsubscribe()` in `ngOnDestroy`
3. **Module imports** -- Standalone components must import their dependencies in the `imports` array. NgModule components get imports from their declaring module
4. **Two-way binding** -- Use `[(ngModel)]` for template forms, `formControlName` for reactive forms. Do not mix
5. **AOT compilation** -- Angular compiles templates ahead of time. Dynamic template strings and `eval()` are not supported
6. **Proxy for development** -- Configure `proxy.conf.json` for API requests during `ng serve`
7. **Environment files** -- `environment.ts` for dev, `environment.prod.ts` for production. Angular 17+ uses different config -- check `angular.json`
