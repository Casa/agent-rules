---
description: No removed error handling
globs:
  - '**/*.ts'
  - '**/*.js'
---

# No removed error handling

Flag changes that DELETE error handling around risky work without an equivalent
replacement. Removing a `try`/`catch`, a promise `.catch()`, or an error log
turns handled failures into silent or crashing ones — and the loss is only
visible in the diff, not in the resulting code a linter would see.

## What to flag (inspect removed `-` lines)

- A removed `try`/`catch` (or `.catch()`) around I/O, parsing, or external calls
- A removed error log or rethrow that previously surfaced a failure
- A removed fallback/default that previously handled an error path

## What NOT to flag

- The handling was moved up or down the call stack and still exists in the diff
- The risky operation itself was also removed
- Pure rename or formatting churn

## Anchoring

Anchor the finding to the nearest surviving line where the removed handling used
to be; the deleted line no longer exists in the new file.
