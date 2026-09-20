---
name: check-pipeline
description: Check the status of the current or latest GitLab CI pipeline with glab, wait for it if it is still running, pull the logs of failed jobs, and explain concretely why they failed. Use this whenever the user asks about CI/CD state or pipeline results — "check the pipeline", "did CI pass?", "why is the build red?", "що з пайплайном", "перевір ci", "чому впав пайплайн", "подивись чи пройшли тести на гітлабі" — and also right after pushing a commit or opening an MR, when the user wants to know whether the pipeline they just triggered is green. Prefer this skill over ad-hoc glab commands, because bare `glab ci` commands drop into interactive pickers or block forever on `--live`.
compatibility: Requires `glab` authenticated via `glab auth status`, plus `jq` and `perl`. Run from inside the target Git repository.
---

# Check Pipeline

Answer one question well: **is CI green, and if not, what exactly broke?**

The value is in the diagnosis, not in relaying statuses. `failed` is not an answer — `linter failed: eslint hit 3 unused-var warnings with --max-warnings 0, in src/components/scan-demo/index.tsx:23 and two more files` is. Reach that level of specificity for every blocking failure, and don't pad the report with anything else.

## Non-interactive discipline

You have no terminal to type into and, on macOS, usually no `timeout` binary to escape a hung command. These commands hang or block and must be avoided:

- `glab ci view` — full-screen TUI.
- `glab ci status --live`, `glab ci status --wait` — block until the pipeline ends, with no bound you control.
- `glab ci trace`, `glab ci retry`, `glab ci cancel` **without** a job argument — interactive job picker.
- `glab ci trace <job>` on a job that is still running — streams until the job finishes.

Everything below uses bounded, one-shot commands instead. `glab ci get` is the workhorse: `-F json` plus `--jq` gives exactly the fields you need in one call.

## Step 1 — Resolve which pipeline to look at

From the repository root, resolve the pipeline **and pin it in the same breath**, then report from the pinned id:

```bash
repo_flag=""                    # or: repo_flag="-R group/sub/repo"
selector=""                     # or: -p <pipeline-id> / -b <branch> / --merge-request <iid>
pipeline_id=$(glab ci get $repo_flag $selector -F json --jq '.id')
glab ci get $repo_flag -p "$pipeline_id" -F json --jq '"\(.id) \(.status) ref=\(.ref) sha=\(.sha[0:8]) \(.web_url)"'
```

`$repo_flag` and `$selector` are deliberately unquoted so that empty values disappear instead of becoming empty arguments.

With an empty selector this takes the latest pipeline for the current branch, and if the branch has no pipeline of its own it falls back to the head pipeline of the branch's merge request — which is what you usually want, since MR pipelines run on `refs/merge-requests/<iid>/head`, not on the branch ref.

Override when the user pointed somewhere specific:

| Target | Flag |
| --- | --- |
| A specific pipeline | `-p <pipeline-id>` |
| Another branch | `-b <branch>` |
| An MR's head pipeline | `--merge-request <iid>` |
| Another project | `-R <group>/<sub>/<repo>` |
| Recent pipelines, to pick one | `glab ci list -F json` |

If glab reports `No pipeline found for branch …`, say so plainly and check whether the branch was pushed (`git log origin/<branch>..HEAD`) instead of guessing at another pipeline. A missing pipeline and a failed pipeline are very different news.

Every command below passes `$repo_flag -p "$pipeline_id"`. This is not ceremony: a bare `glab ci get` re-resolves to the newest pipeline of the current branch in the current repository, so without pinning you can start on the pipeline the user asked about and finish by reporting a different one — after a push, a retry, or simply because they asked about another project.

## Step 2 — Classify the status before doing anything else

Terminal: `success`, `failed`, `canceled`, `skipped`.
In flight: `created`, `waiting_for_resource`, `preparing`, `pending`, `running`, `scheduled`.
Waiting on a human: `manual` — the pipeline is blocked on a manual job, not broken.

Route on this, and route every state — an unhandled state is where this skill silently produces a wrong answer:

| Status | Route |
| --- | --- |
| `success` | Step 3 |
| `created`, `waiting_for_resource`, `preparing`, `pending`, `running`, `scheduled` | Step 4 |
| `failed` | Step 5 |
| `canceled` | Step 5, but list jobs by `select(.status=="failed" or .status=="canceled")` — see the note there |
| `manual` | Not broken. Name the manual job that is waiting (`select(.status=="manual")`) and stop. Don't poll: nothing will change without a human. |
| `skipped` | One line: the pipeline never ran, and why if `workflow:`/`rules:` make it obvious. Stop. |

## Step 3 — Green pipeline

Say it in one or two lines: pipeline id, status, ref, duration, URL. Do not fetch logs, and do not editorialize.

The one thing worth adding: if any job has `allow_failure: true` and failed, the pipeline is still green but something did break. Surface those as a short note, because they are invisible in the overall status and are exactly the failures people miss:

```bash
glab ci get $repo_flag -p "$pipeline_id" -F json --jq '.jobs[] | select(.status=="failed") | "\(.name) (\(.stage)) allow_failure=\(.allow_failure)"'
```

## Step 4 — Pipeline still running

Tell the user immediately, before you start waiting, so they aren't staring at silence: which pipeline, what's already done, what's still going.

```bash
glab ci get $repo_flag -p "$pipeline_id" -F json --jq '[.jobs[] | "\(.status)\t\(.name)"] | .[]'
```

Then poll in short bursts. Keep each command short — a single call that could block for ten minutes looks like a hang and may be killed by the runtime, and there is no `timeout` binary on macOS to bound it:

```bash
for i in 1 2 3; do
  status=$(glab ci get $repo_flag -p "$pipeline_id" -F json --jq '.status')
  case "$status" in
    success|failed|canceled|skipped|manual) break ;;
  esac
  sleep 15
done
echo "status after ${i} polls: $status"
```

If it's still running after the burst, report what moved and ask whether to keep waiting rather than looping again on your own. To set expectations, read how long the previous pipeline took — note that `glab ci list` does **not** return `duration`, only `glab ci get` does:

```bash
prev=$(glab ci list $repo_flag -F json --jq '.[1].id // empty')
[ -n "$prev" ] && glab ci get $repo_flag -p "$prev" -F json --jq '.duration'   # seconds
```

The `// empty` guard matters on a young project: with fewer than two pipelines, `.[1].id` yields `null`, and `-p null` fails because the flag takes an integer.

When polling ends, route the final status through the Step 2 table again — including `manual` and `skipped`, which are not failures.

## Step 5 — Failed pipeline: find the failures

```bash
glab ci get $repo_flag -p "$pipeline_id" -F json --status failed --jq '.jobs[] | "\(.id)\t\(.name)\t\(.stage)\tallow_failure=\(.allow_failure)\t\(.failure_reason // "-")\t\(.web_url)"'
```

For a **canceled** pipeline, don't use `--status failed`: it maps to the API's `scope=failed` and can return nothing at all, which reads as "nothing failed" when in fact a job broke and the rest were canceled. Filter client-side instead:

```bash
glab ci get $repo_flag -p "$pipeline_id" -F json --jq '.jobs[] | select(.status=="failed" or .status=="canceled") | "\(.id)\t\(.name)\t\(.status)\t\(.failure_reason // "-")"'
```

Two fields decide how much work each failure deserves:

**`allow_failure`** separates blocking failures from noise. A failed job with `allow_failure: true` did not turn the pipeline red on its own and usually shouldn't drive the user's next action. Report it, but spend your effort on the blocking ones.

**`failure_reason`** tells you whether the code is even implicated:

| `failure_reason` | Meaning | What to do |
| --- | --- | --- |
| `script_failure` | The job's script exited non-zero | Read the log — this is the real diagnosis work |
| `runner_system_failure`, `stuck_or_timeout_failure`, `job_execution_timeout` | Infrastructure: runner died, no runner picked it up, job exceeded its limit | Say it's infra, recommend a retry, and don't invent a code explanation |
| `script_failure` on a job the user never touched (e.g. artifact upload, cache) | Often infra wearing a script mask | Read the log before deciding |

Getting this distinction wrong is the most common way this report becomes actively misleading: sending someone to debug their code when the runner ran out of disk wastes real time.

`script_failure` also over-claims in one common case: scanner jobs (`sast`, `sonarqube-check`, license checks) usually run their tool with `|| true` and are then failed by GitLab or by the server's verdict on the uploaded report. The script did not really "exit non-zero on your code", so the log alone will not tell you what's wrong — it says little more than `QUALITY GATE STATUS: FAILED`. Report these as an external verdict and point at where the findings live (the Sonar dashboard URL in the log, the SAST report), rather than describing them as a script error.

Skipped jobs downstream of a failure are consequences, not problems. Mention them only if the user needs to know that deploy never ran.

## Step 6 — Read the log of each blocking failure

Use the bundled script. Runner logs are dominated by cache/docker/artifact chatter, and full logs run to thousands of lines; the script strips timestamps, ANSI codes and section markers, writes the clean full log to a file, and prints only the tail:

```bash
bash <skill-directory>/scripts/job-log.sh <job-id> [tail-lines]   # tail-lines defaults to 120
```

`<skill-directory>` is the folder containing *this* SKILL.md, not the project. Keep the working directory at the repository root — that's how the script resolves the project — and always invoke the script by its absolute path. A relative `scripts/job-log.sh` resolves inside the user's repo, where it doesn't exist, and the fallback you'd reach for next (`glab ci trace`) streams forever on a running job.

If the tail doesn't contain the cause — common for test runners that print the summary early, or for jobs that fail during artifact upload long after the real error — grep the saved file it names instead of re-fetching:

```bash
grep -nE '(FAIL|ERROR|error TS[0-9]+|✖|Cannot find|not found|exit code)' <saved-log-path> | head -40
```

The script takes job ids, not `-R`, so when the pipeline lives in another project you must name that project for the script too — otherwise it reads job ids from one project against another and either 404s or, worse, matches an unrelated job. Same when running outside a Git repo:

```bash
PROJECT=group%2Fsub%2Frepo GLAB_HOSTNAME=gitlab.example.com bash <skill-directory>/scripts/job-log.sh <job-id>
```

Read enough to name the cause, not to summarize the log. You're looking for the command that failed, the assertion or rule that broke, the files and lines involved, and the exit condition. Once you have those four, stop reading.

## Step 7 — Report

Lead with the verdict, then the evidence. Keep it tight — the user wants to know what to do next, not to re-read the log through you.

```markdown
Pipeline <id> — <status> · <ref> · <short-sha> "<commit title>"
<web_url>

<counts for every status present, e.g. 12 passed, 1 failed, 3 canceled, 1 manual>

**<job> (<stage>)** — <one-line cause, naming the command and the rule/assertion>
    <1–5 log lines that prove it, verbatim>
    <job web_url>

**<job> (<stage>)** — …

Non-blocking (allow_failure): <job> — <one-line cause>

Next: <the single most useful action>
```

Rules that keep this honest and useful:

- One line per failure explaining *why*, in the project's own vocabulary (`--max-warnings 0`, `QUALITY GATE STATUS: FAILED`), not a paraphrase.
- Quote log lines verbatim, and only the ones that carry the failure. Trimmed evidence is what makes the report trustworthy.
- Always include job URLs. The user will want to open the failing job.
- Name every blocking failure. Three red jobs with one shared root cause is still worth stating as three, with the shared cause called out once.
- If a failure is infra, say so and stop; don't manufacture a code-level story.
- If you couldn't determine the cause, say which job and what you looked at. An honest gap beats a confident guess.

Stop after reporting. Fixing the failures is a separate decision the user makes — if they ask you to fix them, use the `fix-pipeline` skill.
