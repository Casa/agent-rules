---
description: Review your working-tree changes against the project's agent-rules
allowed-tools: Bash(agent-rules:*), Bash(npx:*), Bash(git:*)
---

Review the working-tree changes against this project's agent-rules. Do the review
yourself — `--list` only discovers the applicable rules; it does not call a model
(so there's no nested agent and no extra cost).

Applicable rules and their guidance:

!`agent-rules --working-tree --list --output text 2>/dev/null || npx -y @casa/agent-rules --working-tree --list --output text`

Changes under review:

!`git --no-pager diff HEAD`

For each rule above, check the diff for violations. Report each finding as:
`<path>:<line> [blocking|suggestion|nitpick] — what's wrong and how to fix`,
anchored to a line that appears in the diff. Pay special attention to REMOVED
(`-`) lines, since several rules target deletions. Skip rules that aren't
violated. End with a one-line summary of counts by severity, or
"No issues found." if clean.
