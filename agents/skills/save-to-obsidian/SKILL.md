---
name: save-to-obsidian
description: >
  Save session work summary as Obsidian note. Summarizes what was done in current session,
  generates title, creates markdown job-log in Obsidian vault.
  Use when user says "save to obsidian", "log this session", "save session",
  or invokes /save-to-obsidian.
---

# Save to Obsidian — Session Job Log

Create a structured job-log note in the user's Obsidian vault summarizing the current session.

## Obsidian Vault

**Platform detection:** Before writing, determine the platform by checking `uname` or the OS environment:

| Platform | Vault path |
|----------|-----------|
| **macOS** (darwin) | `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/vantuh/` |
| **WSL / Linux** | `~/obsidian-backup/` |

Notes folder inside vault: `Sessions/`

Detect platform first, then construct the full path for notes accordingly.

## Workflow

1. **Detect platform**: Run `uname` to determine OS. Use macOS path if `Darwin`, WSL/Linux path otherwise.

2. **Ensure folder exists**: Create `Sessions/` folder if it doesn't exist yet.

2. **Analyze session**: Review the entire conversation history. Identify:
   - What project/directory was being worked on
   - What tasks were performed
   - What problems were solved
   - What key decisions were made
   - What files were changed
   - What commands were run and their outcomes
   - Any notable findings or insights

3. **Generate title**: Create a concise, descriptive title that captures the essence of the session. Format: action-oriented, e.g. "Fix auth middleware token validation", "Set up CI pipeline for monorepo", "Refactor database connection pooling".

4. **Generate filename**: Use format `YYYY-MM-DD_<slug>.md` where `<slug>` is the title in kebab-case. Use current date. Example: `2025-04-30_fix-auth-middleware-token-validation.md`

5. **Check for existing note**: Look in `Sessions/` for a file with today's date prefix (`YYYY-MM-DD_`) that matches the current session's topic. If found — **update** the existing note instead of creating a new one. Merge new information into existing sections (append new bullets to "What Was Done", update "Summary" to reflect full session, add new files to "Files Changed", etc.). Keep the original title unless the session scope changed significantly.

6. **Create or update the note** using the template below.

7. **Confirm** to user: show the title, path, and whether it was created or updated.

## Note Template

```markdown
---
date: {{YYYY-MM-DD}}
time: {{HH:MM}}
project: {{project name or directory}}
tags:
  - session-log
  - {{relevant-tag}}
---

# {{Title}}

## Summary

{{2-4 sentence high-level summary of what was accomplished in this session}}

## What Was Done

{{Detailed bullet list of tasks performed, in chronological order. Each item should be specific and actionable, not vague. Include file paths where relevant.}}

## Key Decisions

{{Bullet list of important decisions made during the session and their reasoning. Skip if no significant decisions were made.}}

## Problems & Solutions

{{Any issues encountered and how they were resolved. Skip section if none.}}

## Files Changed

{{List of files that were created, modified, or deleted. Use bullet list with brief description of change per file.}}

## Notes

{{Any additional context, insights, or follow-up items worth remembering. Things to revisit, open questions, or gotchas discovered.}}
```

## Rules

- Write note content in the same language the user was using during the session.
- Be specific and concrete. "Fixed bug" is bad. "Fixed off-by-one error in pagination logic in `src/api/users.ts:45`" is good.
- Include code snippets only if they are critical to understanding (e.g., a tricky fix). Don't dump large blocks.
- Tags should reflect the domain: `typescript`, `devops`, `refactoring`, `bugfix`, `feature`, `config`, etc. Always include `session-log`.
- If session was trivial (single small action), keep note short. Match note length to session substance.
- Skip empty sections rather than writing "None" or "N/A".
- Use the Write tool to create the file. The path contains spaces — handle properly.
