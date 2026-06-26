---
description: No console.log
globs:
  - '**/*.ts'
  - '**/*.js'
  - '!**/*.test.ts'
---

# No console.log

Flag every `console.log` / `console.debug` call in source code. Debug output must
be removed before merge; use the project's logger for anything intentional.
