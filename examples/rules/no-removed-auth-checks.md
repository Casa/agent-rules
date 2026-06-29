---
description: No removed authorization checks
globs:
  - '**/*.ts'
  - '**/*.js'
---

# No removed authorization checks

Flag changes that DELETE an authorization, permission, or input-validation check
guarding a sensitive operation, without an equivalent replacement.

A deleted guard is invisible in the final code — the new version simply lacks it —
so only the diff's removed (`-`) lines reveal the regression. This is something a
static linter cannot catch: it only sees the code that remains.

## What to flag (inspect removed `-` lines)

- A removed permission/role check (e.g. `-if (!user.isAdmin) throw …`)
- A removed authentication or ownership check before a privileged action
- A removed input/argument validation guarding a destructive or external call

## What NOT to flag

- The check was moved or refactored and an equivalent still appears in the diff
- The operation the check protected was also removed
- Pure rename or formatting churn

## Anchoring

Anchor the finding to the nearest surviving line (the context or added line where
the removed check used to be); the deleted line no longer exists in the new file.
