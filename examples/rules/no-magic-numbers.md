---
description: No magic numbers
globs:
  - '**/*.ts'
  - '**/*.js'
---

# No magic numbers

Flag unexplained numeric literals in non-trivial expressions (timeouts, sizes,
limits, etc.). Suggest extracting a named constant that documents the intent.
Obvious values like `0`, `1`, and `-1` are fine.
