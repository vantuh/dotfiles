---
name: fix-sonar
description: Fetch SonarQube issues for the current repository, automatically discover the Sonar project key, analyze findings against local code, and fix them with verification. Use whenever the user asks to inspect, address, resolve, or fix Sonar/SonarQube findings, errors, bugs, vulnerabilities, code smells, quality-gate failures, or says things like "fix sonar", "витягни зауваження з sonar", or "пофікси помилки sonarqube".
compatibility: Requires Node.js 22+ (or Node 18+ with `npx --yes tsx`), git, SONAR_TOKEN, and FOODTECH_SONAR_URL. The token must be a SonarQube user token with Browse permission.
---

# Fix SonarQube Issues

Use the bundled CLI instead of reconstructing API calls. It discovers the project from the repository and downloads unresolved issues with pagination, up to SonarQube's 10,000-result API limit.

## Preconditions

Work from the target repository root. Require these environment variables without printing their values:

- `FOODTECH_SONAR_URL`: corporate SonarQube base URL
- `SONAR_TOKEN`: SonarQube **user token** with Browse permission for the project

Do not search files, shell history, dotfiles, or credential stores for a missing token. If either variable is absent, stop and tell the user which variable to export.

## Fetch issues

Resolve `scripts/sonar.ts` relative to this `SKILL.md`, while keeping the command's working directory at the target repository root. Save the response outside the repository so raw server data does not dirty the working tree:

```bash
report="$(mktemp "${TMPDIR:-/tmp}/sonar-issues.XXXXXX")"
node --experimental-strip-types <skill-directory>/scripts/sonar.ts fetch > "$report"
```

The fetcher discovers the project key in this order:

1. `.scannerwork/report-task.txt` from the last local analysis
2. root `sonar-project.properties`
3. an unambiguous `sonar.projectKey` in tracked build or CI configuration
4. the repository name from `git remote origin`, matched through `/api/components/search`

A single API search result is accepted. Multiple plausible local keys or API results are intentionally treated as ambiguous; show the candidates and ask the user to choose. After they choose, rerun:

```bash
node --experimental-strip-types <skill-directory>/scripts/sonar.ts fetch --project-key '<key>' > "$report"
```

Never silently pick the first fuzzy match. This matters for monorepos and similarly named services.

If the API returns 401/403, report the error and explain that `SONAR_TOKEN` must be a user token with Browse access. Do not fall back to analysis tokens or scrape the SonarQube UI.

## Inspect before editing

Use the bundled inspector for the first pass rather than loading a potentially large issue array into context. It sorts by priority and clusters findings with the same `rule + local path + message`:

```bash
node --experimental-strip-types <skill-directory>/scripts/sonar.ts inspect "$report"
```

Inspect a selected issue in full when you need its exact range or diagnostic flow:

```bash
node --experimental-strip-types <skill-directory>/scripts/sonar.ts inspect "$report" --issue '<issue-key>'
```

The full view includes `textRange`, modern `impacts`, and `flows`. Flow locations often explain the whole diagnostic chain—for example, every nesting level contributing to a complexity finding—so inspect them before deciding where to refactor.

If `truncated` is true, warn that SonarQube's issue-search API exposed only the first 10,000 results and narrow the scope before editing. If there are many issues, process them in small batches. Prioritize vulnerabilities and bugs, then findings with the highest modern impact or legacy severity, unless the user specifies another scope. Tell the user the total and proposed batch before making broad changes.

Treat a cluster as a possible shared root cause, not as unrelated edits. A repeated rule at several lines in one file may be resolved by one well-named helper or structural change. Still inspect every issue location and retain every issue key so completion can account for all findings.

For each issue or cluster:

1. Prefer the generated `path`; verify that it exists locally. Fall back to `component` only when `path` is null.
2. Read the reported line, `textRange`, every relevant `flows[].locations[]`, the surrounding function, and relevant tests.
3. Understand the rule and whether the finding is valid in this codebase. Do not make behavior-changing edits merely to silence Sonar.
4. Make the smallest change that addresses the root cause. Keep unrelated formatting and refactors untouched. For test-assertion findings, add an assertion that verifies the test's actual intent—not a vacuous assertion added only to satisfy the rule.
5. Re-check every issue location in the cluster after the edit, then run the repository's existing focused test, lint, typecheck, or build command. Verify commands from project configuration before invoking them.

Treat ambiguous findings and likely false positives as decisions requiring user review. Do not add suppression comments, exclusions, `NOSONAR`, or mark issues false-positive/won't-fix unless the user explicitly approves that specific action.

This fetcher covers `/api/issues/search`; SonarQube Security Hotspots use a separate API and are outside this skill's current report. State that limitation if the user asks for hotspots or for every security finding. On Community installations, results normally correspond to the analyzed main branch; do not assume they represent the current feature branch.

## Completion

Do not call Sonar issue-transition APIs. Code findings should close after a fresh Sonar analysis, not because the agent changed their server status.

At the end, report:

- detected project key and how it was found
- fixed issue keys with files
- skipped or ambiguous issues and why
- verification commands and results
- whether a fresh Sonar scan still needs to run

Only run SonarScanner when the repository already defines the command and the user permits it; analysis can upload data and consume corporate CI resources.
