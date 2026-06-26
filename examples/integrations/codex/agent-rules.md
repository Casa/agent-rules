Review my working-tree changes against this project's agent-rules.

Steps:

1. List the rules that apply to the current changes. This only discovers rules —
   it does not call a model:

   `agent-rules --working-tree --list --output text`

   (If `agent-rules` isn't installed, use `npx -y @casa/agent-rules --working-tree --list --output text`.)

2. Show the changes: `git --no-pager diff HEAD`

3. For each applicable rule, check the diff for violations. Report each finding as
   `<path>:<line> [blocking|suggestion|nitpick] — what's wrong and how to fix`,
   anchored to a line that appears in the diff. Pay special attention to REMOVED
   (`-`) lines, since several rules target deletions. Skip rules that aren't
   violated. End with a one-line summary of counts by severity.
