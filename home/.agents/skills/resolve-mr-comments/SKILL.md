---
name: resolve-mr-comments
description: Fetch unresolved review comments on a GitLab merge request with glab, analyze each one against the actual codebase, and write a checkboxed fix plan to mr-<id>-comments-fix-plan.md at the repo root — then optionally implement the fixes while ticking off progress. Use this whenever the user wants to address, triage, resolve, or plan fixes for MR / merge-request review comments, reviewer feedback, or code-review notes, even if they only give an MR number and say something like "fix the comments on MR 9022", "подивись що просять у ревʼю", "розберись із зауваженнями рев'юера", or "go through the unresolved threads on !1234".
---

# Resolve MR Comments

Reviewers leave comments on a merge request; this skill turns those comments into a concrete, verified fix plan and (optionally) the fixes themselves. The value is in the *analysis*: a raw comment like "оце через tailwind" means nothing until you find the exact file, understand what the reviewer wants, and decide the concrete change. Do that work so the plan is actionable, not a restatement of the comments.

## Inputs

You need an MR identifier. Accept it however the user gives it: a number (`9022`), a `!9022` reference, or a branch name.

- If the user gives an MR id, use it.
- If they don't, try the MR for the current branch: `glab mr view --unresolved` (no id resolves the current branch's MR).
- If neither resolves, ask the user which MR — don't guess.

## Step 1 — Fetch unresolved comments

Always request JSON output — the structured form is far easier and more reliable for a model to parse than the rendered text (each thread carries its file path, line, author, body, and resolution state as discrete fields, so nothing has to be scraped out of formatted output):

```bash
glab mr view <id> --unresolved -F json
```

`--unresolved` implies `--comments` and limits the discussions to the open ones — exactly what needs resolving. Use `--jq` to narrow the JSON to the fields you need (author, body, position/file/line, resolved) when a thread list is large.

Also fetch the MR metadata you'll cite in the plan (title, URL) as JSON from the same command without `--unresolved`: `glab mr view <id> -F json`.

**If `glab` fails, stop and tell the user — do not work around it.** Authentication and access are the user's to grant, not yours to scavenge. Specifically:

- Command not found → tell the user `glab` isn't installed.
- Auth error / 401 / "not logged in" → tell the user to run `glab auth login`, then retry. Do **not** search the filesystem, environment variables, git config, or anywhere else for tokens or credentials.
- 403 / 404 / no access → report it plainly and ask the user to confirm the MR id and that they have access.

Report the actual error text so the user can act on it. Never fabricate or guess comments to keep going — an invented plan is worse than no plan.

If the command succeeds but there are **no unresolved comments**, say so and stop. There's nothing to plan.

## Step 2 — Analyze each comment against the codebase

This is the core. For every unresolved comment, do enough investigation to make the fix unambiguous:

- **Locate it.** Comments are usually anchored to a file and line (or a thread on the diff). Find that file and read the surrounding code. If the anchor is missing, infer the target from the comment text and the MR diff (`glab mr diff <id>`).
- **Understand intent.** What is the reviewer actually asking for? "кольори з tailwind" on an SCSS file means "replace hardcoded hex with Tailwind classes/tokens". Translate vague feedback into a concrete change.
- **Classify it** so the plan can be triaged. Useful buckets: bug, refactor, style/lint, i18n/translations, naming, architecture, test, **question** (the reviewer is asking, not requesting a change), nit.
- **Decide the fix.** Name the concrete change and the files it touches. If a comment is a question or genuinely ambiguous, do **not** invent a change — route it to the "Questions / needs clarification" section for the user to answer.

If the investigation is broad (many files, unfamiliar areas), delegate exploration to a `scout` subagent and synthesize its findings rather than spelunking serially. You still own the analysis.

Match the language of the plan to the comments / the user (e.g. write it in Ukrainian if the review is in Ukrainian).

## Step 3 — Write the plan

Write to the repo root as `mr-<id>-comments-fix-plan.md`. Use this structure:

```markdown
# MR <id> — Comments Fix Plan

- MR: <title> (!<id>)
- URL: <url>
- Generated: <YYYY-MM-DD>
- Unresolved comments: <n>

## Summary

<one short paragraph: the recurring themes across the comments>

## Items

### 1. <short title> — <type>
- Comment: "<verbatim or faithful paraphrase>" — <author>
- Location: <path>:<line>  (or "general" if not anchored)
- Analysis: <what this means for the codebase>
- Fix: <concrete change>
- Files: <files to touch>
- [ ] <actionable task>
- [ ] <actionable task, if multi-step>

### 2. ...

## Questions / needs clarification

- [ ] <question-type comment> — <why it needs a human decision>
```

Rules that keep the plan trustworthy:

- One `### Item` per distinct comment/thread. Group only when several comments are literally the same request.
- Every actionable item gets at least one `- [ ]` checkbox so progress is trackable.
- Put reviewer *questions* under "Questions / needs clarification", not "Items" — they need an answer or a decision, not code.
- Keep checkboxes scoped to verifiable work ("replace hex colors in dashboard-counters.scss with Tailwind tokens"), not vague intentions ("improve styling").

After writing, give the user a short summary of the themes and the item count, then move to Step 4.

## Step 4 — Offer to implement

Ask the user whether to implement the plan. Don't start unprompted — they may want to review or reassign items first.

If they say yes:

- Work through items top to bottom. Keep changes **surgical** — each change should trace to a specific comment.
- As you complete each item, edit the plan file and flip its checkbox `- [ ]` → `- [x]`. The plan is the live progress tracker; keep it current so the user can see what's done at a glance.
- Verify with the repo's own build/lint/test before claiming an item done (check `package.json`, `nx.json`, Makefile, etc. for the right command).
- For "Questions / needs clarification" items, don't write code — surface the question and wait for the user's decision.
- If the user asked only for specific items, do just those and leave the rest unchecked.

Do not resolve the threads on GitLab or push anything unless the user explicitly asks — your job ends at code changes plus an updated plan, unless told otherwise.
