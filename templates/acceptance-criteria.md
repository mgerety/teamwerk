# Acceptance Criteria

Every code change must trace to an AC. Every test must reference its AC by ID.

ACs are derived from the functional requirements in `docs/prd.md`. Each AC ID traces to its parent FR (e.g., AC-1.1 traces to FR-01).

---

## AC-1.1: [Testable behavior from FR-01]
**Traces to**: FR-01
**Given** [precondition]
**When** [action]
**Then** [expected result]
Minimum tests: 3 (happy path, error case, edge case)

## AC-1.2: [Another testable behavior from FR-01]
**Traces to**: FR-01
**Given** [precondition]
**When** [action]
**Then** [expected result]
Minimum tests: 3

---

## AC-2.1: [Testable behavior from FR-02]
**Traces to**: FR-02
**Given** [precondition]
**When** [action]
**Then** [expected result]
Minimum tests: 3

---

<!-- Add more ACs as needed. Each AC-X.Y traces to FR-X in the PRD. The report generator parses AC-X.Y patterns from test names and maps them to these definitions. -->
