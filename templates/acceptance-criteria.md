# Acceptance Criteria

This document defines the acceptance criteria for the project. Every code change must trace to an AC. Every test must reference its AC by name.

## Format

Each AC has:
- **ID**: AC-1, AC-2, etc.
- **Title**: Short description
- **Given/When/Then**: Behavior specification
- **Minimum tests**: How many tests this AC needs (default: 3)

---

## AC-1: [Feature Name]

**Given** [precondition]
**When** [action]
**Then** [expected result]

Minimum tests: 3 (happy path, error case, edge case)

---

## AC-2: [Feature Name]

**Given** [precondition]
**When** [action]
**Then** [expected result]

Minimum tests: 3

---

<!-- Add more ACs as needed. The report generator will parse AC-X patterns from test names and map them to these definitions. -->
