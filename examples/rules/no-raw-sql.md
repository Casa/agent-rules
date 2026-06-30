---
description: No raw SQL in repositories
globs:
  - 'src/repositories/**/*.ts'
filter: "grep -ilq 'select \\|insert \\|update \\|delete '"
---

# No raw SQL in repositories

Repository classes must build queries through the query builder, not by
embedding raw SQL strings. Raw SQL bypasses parameter binding and the schema
types, and is the usual source of injection bugs.

The `filter` above is a second-stage applicability check: after the globs select
the changed repository files, it runs `grep` over them and the rule only applies
when at least one matched file actually contains a SQL keyword. If none do, the
rule is skipped without calling the model — globs match the _files_, the filter
matches the _content_.

## What to flag

- A template literal or string concatenation containing `SELECT`/`INSERT`/
  `UPDATE`/`DELETE` passed to a `query`/`raw`/`execute` call.
- User-derived values interpolated into a SQL string.

## What NOT to flag

- Query-builder calls (`.select(...)`, `.where(...)`, etc.).
- SQL inside migration files or fixtures (those live outside `src/repositories/`).
