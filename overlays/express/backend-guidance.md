# Express.js -- Backend Build Guidance

> Stack overlay for the Backend Builder. This supplements the generic role with Express-specific patterns, conventions, and gotchas.

---

## Project Structure

A well-organized Express project follows this layout:

```
src/
  server.js          -- Entry point: creates app, starts listening
  app.js             -- Express app configuration (middleware, routes)
  routes/
    tasks.js         -- Route handlers grouped by resource
    auth.js          -- Authentication routes
  middleware/
    errorHandler.js  -- Centralized error handling
    auth.js          -- JWT verification middleware
    validate.js      -- Input validation middleware
  models/            -- Data models or in-memory stores
public/              -- Static frontend files (HTML, CSS, JS)
```

### Entry Point Pattern

Separate app creation from server startup so tests can import the app without starting a listener:

```js
// app.js -- configure and export, do NOT listen here
const express = require('express');
const app = express();

app.use(express.json());
// ... middleware and routes ...

module.exports = app;
```

```js
// server.js -- import app and start listening
const app = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

This separation is critical for testability. The Test Engineer imports `app.js` directly with supertest.

---

## Routing

Use `express.Router()` to group routes by resource:

```js
// routes/tasks.js
const router = require('express').Router();

router.get('/', (req, res) => { /* list tasks */ });
router.post('/', (req, res) => { /* create task */ });
router.get('/:id', (req, res) => { /* get single task */ });
router.put('/:id', (req, res) => { /* update task */ });
router.delete('/:id', (req, res) => { /* delete task */ });

module.exports = router;
```

Mount in `app.js`:

```js
const taskRoutes = require('./routes/tasks');
app.use('/api/tasks', taskRoutes);
```

### Route Naming Conventions

- Plural nouns for collections: `/api/tasks`, `/api/users`
- Resource ID as path parameter: `/api/tasks/:id`
- Nested resources if needed: `/api/projects/:projectId/tasks`
- No verbs in URLs -- use HTTP methods instead

---

## Middleware

### Order Matters

Apply middleware in this order in `app.js`:

```js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// 1. Security headers
app.use(helmet());

// 2. CORS
app.use(cors());

// 3. Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Static files
app.use(express.static('public'));

// 5. Routes
app.use('/api/tasks', require('./routes/tasks'));

// 6. Error handler (MUST be last)
app.use(require('./middleware/errorHandler'));
```

### Centralized Error Handling

Express error-handling middleware takes four arguments. This is NOT optional -- the four-argument signature is how Express identifies it as an error handler:

```js
// middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  console.error(err.stack);

  if (err.type === 'validation') {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
};
```

**Gotcha**: If you forget the `next` parameter, Express treats it as a regular middleware and it will never catch errors.

### JSON Parse Error Handling

Express does not handle malformed JSON gracefully by default. Add a middleware to catch `SyntaxError` from `express.json()`:

```js
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});
```

---

## Authentication

### JWT Pattern

```js
// middleware/auth.js
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticateToken, SECRET };
```

### Token Endpoint

Provide a `/api/auth/token` endpoint so tests and the frontend can obtain a token:

```js
router.post('/token', (req, res) => {
  const { username, password } = req.body;
  // Validate credentials...
  const token = jwt.sign({ username }, SECRET, { expiresIn: '1h' });
  res.json({ token });
});
```

---

## Input Validation

### With express-validator

```js
const { body, validationResult } = require('express-validator');

const validateTask = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must be 200 characters or fewer'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Description must be 2000 characters or fewer'),
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}
```

### Manual Validation

If express-validator is not installed, validate manually in route handlers:

```js
router.post('/', (req, res) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Proceed with creation...
});
```

---

## Security

### HTML Entity Escaping

Sanitize user input before storing to prevent XSS when the frontend renders it:

```js
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

Apply this to all user-provided string fields before storing them.

### Security Headers

Use `helmet` for baseline security headers. If helmet is not available, set headers manually:

```js
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

---

## Static File Serving

Serve the frontend from `public/`:

```js
app.use(express.static('public'));

// SPA fallback -- serve index.html for unmatched routes (after API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
```

**Gotcha**: Place the static middleware and SPA fallback AFTER API routes to avoid conflicts.

---

## Environment Variables

Use `dotenv` for local development:

```js
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
```

Never commit `.env` files. Provide a `.env.example` with placeholder values.

---

## Common Gotchas

1. **Forgetting `express.json()`** -- POST/PUT body will be `undefined` without it
2. **Async error handling** -- Express does not catch promise rejections by default. Wrap async handlers or use `express-async-errors`
3. **Port conflicts** -- Use `process.env.PORT` and document the default
4. **CORS in development** -- Frontend on a different port needs CORS enabled
5. **Route order** -- More specific routes must come before parameterized routes (`/tasks/stats` before `/tasks/:id`)
6. **Content-Type checking** -- `express.json()` only parses `application/json` bodies. Other content types are silently ignored
