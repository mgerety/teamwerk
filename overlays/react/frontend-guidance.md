# React -- Frontend Build Guidance

> Stack overlay for the Frontend Builder. This supplements the generic role with React-specific patterns, conventions, and gotchas.

---

## Stack Discovery

Detect the React variant by examining project configuration:

| File/Pattern | Stack |
|---|---|
| `next.config.*` | Next.js |
| `vite.config.*` + React plugin | Vite + React |
| `react-scripts` in package.json | Create React App |
| `remix.config.*` | Remix |
| `gatsby-config.*` | Gatsby |

Use the existing build system. Do not switch from Vite to CRA or vice versa.

---

## Component Structure

### Functional Components Only

```jsx
// CORRECT -- functional component with hooks
function TaskList({ tasks, onComplete, onDelete }) {
  return (
    <ul data-testid="task-list">
      {tasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          onComplete={onComplete}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
```

### File Organization

```
src/
  components/
    TaskList.jsx          -- or TaskList.tsx
    TaskItem.jsx
    TaskForm.jsx
    ConfirmDialog.jsx
    EmptyState.jsx
  hooks/
    useAuth.js
    useTasks.js
  api/
    tasks.js              -- API call functions
    auth.js
  App.jsx
  index.jsx               -- or main.jsx
```

### Component Naming

- PascalCase for components: `TaskList`, `ConfirmDialog`
- camelCase for hooks: `useAuth`, `useTasks`
- One component per file (main export matches filename)

---

## State Management

### Local State (useState)

Use for component-specific state:

```jsx
const [tasks, setTasks] = useState([]);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
```

### Complex State (useReducer)

Use when state transitions are predictable:

```jsx
function taskReducer(state, action) {
  switch (action.type) {
    case 'SET_TASKS':
      return { ...state, tasks: action.payload, isLoading: false };
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.payload] };
    case 'REMOVE_TASK':
      return { ...state, tasks: state.tasks.filter(t => t.id !== action.payload) };
    default:
      return state;
  }
}
```

### Shared State (Context API)

Use for auth tokens, theme, or other cross-cutting concerns:

```jsx
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [token, setToken] = useState(null);

  return (
    <AuthContext.Provider value={{ token, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}
```

**Detect first**: If the project uses Redux, Zustand, or Jotai, use that instead of Context.

---

## Routing (react-router-dom v6)

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TaskList />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Navigation

```jsx
import { useNavigate, useParams } from 'react-router-dom';

function TaskItem({ task }) {
  const navigate = useNavigate();
  return <div onClick={() => navigate(`/tasks/${task.id}`)}>{task.title}</div>;
}
```

---

## API Calls

### Fetch Pattern

```jsx
async function fetchTasks(token) {
  const response = await fetch('/api/tasks', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch tasks');
  }

  return response.json();
}
```

### Custom Hook for Data Fetching

```jsx
function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token } = useAuth();

  useEffect(() => {
    let cancelled = false;

    fetchTasks(token)
      .then(data => { if (!cancelled) setTasks(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [token]);

  return { tasks, isLoading, error, setTasks };
}
```

**Detect first**: If the project uses React Query (TanStack Query), use `useQuery` and `useMutation` instead of manual fetch hooks.

---

## Forms

### Controlled Components

```jsx
function TaskForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      await onSubmit({ title: title.trim() });
      setTitle('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form id="task-form" onSubmit={handleSubmit}>
      <label htmlFor="title-input">Title</label>
      <input
        id="title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-describedby={error ? 'title-error' : undefined}
      />
      {error && <span id="title-error" role="alert">{error}</span>}
      <button type="submit" id="submit-btn">Add Task</button>
    </form>
  );
}
```

---

## Confirmation Dialog

Build a styled modal, NOT a browser `confirm()`:

```jsx
function ConfirmDialog({ isOpen, message, onConfirm, onCancel }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" data-testid="confirm-dialog">
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        <p className="confirm-message">{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} className="btn-danger">Confirm</button>
        </div>
      </div>
    </div>
  );
}
```

---

## Styling

Detect the project's styling approach:

| Indicator | Approach |
|---|---|
| `tailwind.config.js` | Tailwind CSS |
| `*.module.css` imports | CSS Modules |
| `styled-components` in package.json | styled-components |
| `@emotion` in package.json | Emotion |
| Plain `.css` imports | Global CSS |

Use whatever is already in the project. If nothing exists, CSS Modules or a single global stylesheet are safe defaults.

---

## Accessibility

### Required Practices

```jsx
// Labels for all inputs
<label htmlFor="title-input">Title</label>
<input id="title-input" />

// Semantic HTML
<button> not <div onClick>
<nav>, <main>, <header>, <footer>

// ARIA for dynamic content
<div role="alert">{errorMessage}</div>
<div aria-live="polite">{statusMessage}</div>

// Keyboard navigation
onKeyDown={(e) => e.key === 'Enter' && handleAction()}
```

---

## XSS Prevention

React auto-escapes JSX expressions by default. The danger zone is `dangerouslySetInnerHTML`:

```jsx
// SAFE -- React escapes this automatically
<span>{task.title}</span>

// DANGEROUS -- bypasses escaping
<span dangerouslySetInnerHTML={{ __html: task.title }} />  // NEVER DO THIS
```

**Rule**: Never use `dangerouslySetInnerHTML` with user-provided data. If you must render HTML, sanitize it first with a library like DOMPurify.

---

## Error Boundaries

Wrap the app in an error boundary to catch render errors:

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div role="alert">Something went wrong. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}
```

---

## Testability

Add `data-testid` attributes to key elements so E2E tests can find them reliably:

```jsx
<ul data-testid="task-list">
<li data-testid="task-item">
<form data-testid="task-form">
<div data-testid="confirm-dialog">
<div data-testid="empty-state">
```

Also use semantic HTML and ARIA roles -- Playwright can query by role, text, and label.

---

## Common Gotchas

1. **useEffect dependency array** -- Missing dependencies cause stale closures. Include all referenced variables
2. **State updates are async** -- `setTasks(newTasks)` does not update `tasks` immediately. Use a callback form if the new state depends on the old: `setTasks(prev => [...prev, newTask])`
3. **Key prop in lists** -- Always use a stable unique ID as the `key`, not the array index
4. **Cleanup in useEffect** -- Return a cleanup function to prevent state updates on unmounted components
5. **Conditional hooks** -- Hooks cannot be called inside conditions or loops. Always call at the top level
6. **CORS in development** -- If using Vite, add a proxy in `vite.config.js`. If using CRA, add `"proxy"` in `package.json`
7. **Environment variables** -- Vite: `VITE_` prefix. CRA: `REACT_APP_` prefix. Next.js: `NEXT_PUBLIC_` prefix
