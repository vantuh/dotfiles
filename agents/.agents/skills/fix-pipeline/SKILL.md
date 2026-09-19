---
name: fix-pipeline
description: Diagnose a failed GitLab CI pipeline with glab, reproduce each failing job locally using the exact command CI ran, fix the root cause in the code, and verify locally before the user pushes. Use whenever the user wants CI made green rather than just explained — "fix the pipeline", "fix the failing jobs", "CI is red, sort it out", "пофіксь пайплайн", "виправ те що впало в ci", "зроби щоб пайплайн був зелений", "лінтер впав, полагодь" — including after a check-pipeline report when they ask you to act on it. Use check-pipeline instead when they only want to know the status.
compatibility: Requires `glab` (authenticated), `jq`, `perl`, and the project's own toolchain (whatever CI runs — npm, gradle, make…). Run from inside the target Git repository.
---

# Fix Pipeline

Turn a red pipeline green by fixing what actually broke — verified locally, before anything is pushed.

Two failure modes make this task go wrong, and both are worth naming up front. The first is fixing the wrong thing: a runner that ran out of disk is not a code problem, and no edit will help. The second is making CI green without making the code correct — relaxing a lint threshold, disabling a rule, skipping a test. Both leave the user worse off than a red pipeline, because a red pipeline at least tells the truth.

## Step 1 — Get the diagnosis

Don't start from a guess about what's failing. Use the **check-pipeline** skill by name (its frontmatter `name: check-pipeline`) — it owns pipeline resolution, job listing and log retrieval, including the non-interactive command discipline that keeps `glab` from hanging. Don't try to reach it by a relative path like `../check-pipeline/`: that only resolves from inside the skills folder, never from the user's repository.

If it isn't available, the minimum you need is — resolving the pipeline once and pinning it, so a push mid-diagnosis can't switch you to a different pipeline:

```bash
repo_flag=""                    # or: repo_flag="-R group/sub/repo"
pipeline_id=$(glab ci get $repo_flag -F json --jq '.id')
glab ci get $repo_flag -p "$pipeline_id" -F json --jq '"\(.id) \(.status) \(.web_url)"'
glab ci get $repo_flag -p "$pipeline_id" -F json --status failed --jq '.jobs[] | "\(.id)\t\(.name)\t\(.allow_failure)\t\(.failure_reason)"'
glab api projects/:id/jobs/<job-id>/trace | tail -120
```

Never use `glab ci view`, `--live`, `--wait`, or `glab ci trace`/`retry` without a job argument: they block or open an interactive picker you can't answer.

## Step 2 — Triage before touching code

Each failing job falls into one of four buckets, and only one of them is yours to fix by editing files. Sort them first; work in this order.

**Infrastructure** — `failure_reason` is `runner_system_failure`, `stuck_or_timeout_failure` or `job_execution_timeout`, or the log ends in a 5xx from the GitLab API, a registry timeout, or a cache/artifact upload error. Nothing in the repository caused this. Say so and retry the single job:

```bash
glab ci retry <job-id>     # always pass the job id — bare `retry` opens a picker
```

**External service verdict** — the job ran fine and a server said no: a SonarQube quality gate, a license check, a SAST report rejected upstream. This bucket wins over `failure_reason`: scanner jobs typically run their tool with `|| true`, so GitLab reports `script_failure` even though nothing in the script broke, and running that script locally will happily no-op. Judge by the job (`sast`, `sonarqube-check`, license) rather than by the reason code. The fix lives in the code the service is complaining about, or in the service's configuration, and you have to fetch the service's own findings to know which. Don't infer the reason from the job log; it usually only says `QUALITY GATE STATUS: FAILED`. For SonarQube specifically, the `fix-sonar` skill pulls the actual issues.

**Code or config in this repo** — lint, type check, tests, build. This is the main path: Steps 3–6.

**Consequence** — skipped or canceled because something upstream failed. Nothing to fix; it disappears when the real failure does.

If the only failing jobs have `allow_failure: true`, the pipeline is not actually blocked. Tell the user that before spending effort, so they can decide whether it's worth fixing now.

## Step 3 — Find the command CI actually ran

Reproduce the failure with CI's command, not one you assume is equivalent. If the project's `.gitlab-ci.yml` pulls in shared configuration with `include:`, the local file will not show what a job like `linter` or `tests` really runs — the definition lives in the included template. The bundled script resolves every `include:` and prints the job's definition as the server sees it:

```bash
bash <skill-directory>/scripts/job-recipe.sh              # list job names
bash <skill-directory>/scripts/job-recipe.sh linter       # image + script + rules for that job
```

`<skill-directory>` is the folder containing *this* SKILL.md; keep the working directory at the repository root. Invoke the script by absolute path — a relative `scripts/job-recipe.sh` resolves inside the user's repo, where it doesn't exist.

Read all of this from the output, not just the script:

- **`script`** — the command to run locally, verbatim. `npm run lint` and `npx eslint .` are not the same thing; the package script carries flags like `--max-warnings 0` that decide pass/fail.
- **`before_script`** — GitLab runs it in the *same shell* as `script`, so anything it sets up counts: exported variables, generated files such as a registry `.npmrc`, a `cd`, an install step. Skipping it is one of the most common reasons a "faithful" local run behaves differently.
- **`image`** — the toolchain version. A failure that reproduces only in CI is very often a version gap between that image and your local runtime.
- **`variables`** — env the command depends on. If a build needs an API base URL injected at build time, running without it reproduces a different failure than the real one.
- **`services`** — containers the job talks to (database, cache, broker). A job that needs one cannot be reproduced by running the script alone; say so rather than pretending.

One trap: `compile` resolves `include:` but does not flatten `extends:`. The job you asked for may still end with `extends: ".linter"`, pointing at a hidden job (printed with a quoted key). GitLab merges parent into child, so read it in that direction:

- The child's own `script:` **overrides** the parent's. When the concrete job defines `script:`, that is what ran — don't substitute the parent's, which is often an abstract placeholder like `echo "ERROR: Base lint script is not implemented"`.
- When the concrete job has **no** `script:` of its own, the inherited one is what ran. Follow the `extends` chain and read the parent's, applying the same override rule at each level.
- With several parents, or a reference you can't resolve, stop and say the reproduction is approximate instead of guessing which script won.

The compiled definition describes the configuration as it is **now**. For an older pipeline — or after the shared template changed — it may not be what that run executed, and the job log stays the source of truth: it echoes the actual commands. Re-run the script with `REFRESH=1` at the start of each diagnosis, and always after you edit `.gitlab-ci.yml`, so you never read a stale definition.

## Step 4 — Reproduce locally

Run the job's commands as CI does — `before_script` and `script` in one shell, in order — and confirm you see the same failure. This is the step that keeps you honest: without a local reproduction you're editing code on the strength of a log excerpt. If you deliberately skip part of the setup, call the reproduction approximate when you report it.

Compare what you get against the CI log. Three outcomes, three different responses:

- **Same failure** — good. Go fix it.
- **Different failure** — you're not running what CI ran. Re-check `before_script`, the variables and the image version from Step 3 before continuing.
- **Passes locally** — that difference *is* the finding. Look at toolchain version (`node --version` against the job's `image`), a dependency tree that differs from lockfile-clean install (`npm ci`, not `npm install`), env vars only set in CI, or files that are git-ignored locally but absent in CI. Report this rather than editing blind: a fix aimed at a failure you cannot see is a guess.

## Step 5 — Fix the root cause

Keep the change surgical: the smallest edit that makes the real problem go away, in the style of the surrounding code. Fix the failures, not the code near them.

The important boundary is between fixing the cause and silencing the check:

| Failure | Fix the cause | Silence the check (don't) |
| --- | --- | --- |
| Unused variable, `--max-warnings 0` | Remove the dead variable | Raise the warning limit, add `eslint-disable` |
| Failing test | Fix the behavior the test asserts | Change the assertion, `.skip` it |
| Type error | Correct the type or the call | `any`, `@ts-ignore` |
| Quality gate | Address the reported issues | Lower the gate threshold |

Suppression is legitimate sometimes — a false positive, a rule that genuinely doesn't apply, a third-party type gap. What makes it legitimate is that it's a deliberate decision with a reason, and that decision belongs to the user. So when suppression looks like the right answer, explain why and ask instead of doing it quietly. A commit that turns CI green by lowering a bar, discovered later, costs far more trust than a question now.

Same discipline applies to the CI config itself: editing `.gitlab-ci.yml` to skip a job is not a fix.

If your fix doesn't work twice in a row, stop editing. Two failed attempts means the diagnosis is wrong, not the patch. Go back to the log, re-read it fully (`grep` the saved log file rather than re-fetching), and say out loud what you now think the cause is before trying again.

## Step 6 — Verify locally

Rerun the job's own command and confirm it passes. Then run the jobs your change could plausibly have broken — a lint fix that deletes a variable can break a test; a type fix can break the build. Use the same `script` commands from the compiled config, not approximations:

```bash
bash <skill-directory>/scripts/job-recipe.sh tests
```

Read the whole job block rather than slicing it with `grep -A5`: BSD `grep` will cut a multi-line `script: |` block off mid-way and you'll verify with half a command.

Validate `.gitlab-ci.yml` against the server if you touched it:

```bash
glab ci lint
```

Report honestly which checks you ran and which you couldn't. A job that can't run locally (docker build, deploy, SAST) is a real gap — name it as unverified instead of implying it's covered.

## Step 7 — Report and hand back

```markdown
Pipeline <id> was red on <N> jobs. Fixed <M>, <K> left.

**<job>** — <root cause in one line>
    Fix: <what changed, in which files>
    Verified: <exact command> → passed

**<job>** — infrastructure (<failure_reason>). Retried job <id>, no code change needed.

**<job>** — not fixed: <why, and what it needs>

Unverified locally: <jobs that can only run in CI>
Next: <commit / push / decision you need from the user>
```

Committing follows the repository's own rules; pushing is the user's call, so don't push. Once the user pushes, the new pipeline is a check-pipeline job — use that skill to confirm it went green rather than declaring victory from local results.
