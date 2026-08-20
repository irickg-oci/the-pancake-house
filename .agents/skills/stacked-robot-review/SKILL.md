---
name: robot-review
description: Stateless review of the current branch's changes vs its PR base — the preceding PR for a stack, otherwise the target branch — shown locally by default and posted only when asked. Use ONLY when the user explicitly asks for a "robot review" (the literal word "robot").
---

# Robot Review

Stateless review of the current branch's changes against its PR base. For a stacked PR,
that base is the preceding PR's branch; for an ordinary PR, it is the PR's target branch.
Branches without a PR fall back to `main`. Always shown locally; optionally posted to the
PR as a single top-level comment. Uses `git` for the review and `gh` to resolve PR metadata,
read comment context (best-effort), and post.

## Design

- **Stateless.** Every run re-derives findings from the *current* code. Genuinely fixed
  issues disappear from the next review; surviving and regressed issues reappear at their
  true severity. There is no delta tracking, no reconciliation of prior findings, and no
  "follow-up review" narration.
- **One review path, pure git.** The review *content* is always a single `git diff` from
  the merge-base of the resolved PR base — no GitHub read produces a finding. GitHub's
  `baseRefName` only selects the git ref: for a stacked PR it names the preceding PR's
  branch, while the bottom PR names the stack trunk.
- **`gh` is required up front.** The skill confirms `gh` is installed and authenticated
  before anything else and stops if not — without it we can't tell whether a PR exists,
  or resolve that PR's base, which we need for review scope, comment context, and posting.
  (The review content itself is still pure-git.)
- **PR metadata determines scope.** A current PR's `baseRefName` is authoritative. A
  definitive "no PR" result falls back to `main` for a local branch; any other lookup
  failure stops rather than silently reviewing the wrong range.
- **PR comments are best-effort context.** If a PR exists, its comments are folded in so
  the review respects maintainer decisions. A comment-read failure never aborts the review.
- **Local by default; posting is opt-in and gated up front.** With no directive (or
  `local`), the skill only shows the review — it never checks sync and never posts. An
  explicit `post` enables posting, and then the sync gate runs *before* the review, so an
  unpostable branch (dirty, unpushed, stale base, no PR) fails fast instead of producing a
  review it can't post.
- **`gh api` is locked to an explicit GET** (`gh api --method GET …`), matching the
  `Bash(gh api --method GET repos:*)` allowlist. Posting goes through `gh pr comment`,
  never `gh api`. Nothing in this skill pre-approves a mutating API call.
- **Run every command standalone.** Each `git`/`gh` command is its own invocation — never
  chained with `;`/`&&`, wrapped in `echo` separators, or captured with `$(...)`. Command
  substitution and variable assignment can't be statically analyzed against the allowlist
  and force a needless permission prompt; a plain command matches and runs silently.
- **Never edits files or runs tests/builds.**

## Context

- Current branch: !`git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(not a git repo)"`
- Git root: !`git rev-parse --show-toplevel 2>/dev/null || echo "(not a git repo)"`

## Output discipline

Steps 0–4 are **silent setup** — do not narrate the preflight, the posting precheck, which
mode you're in, what commands returned, that you read PR comments, or how you assembled the
diff. The only thing you print is the review itself (Step 5). The two exceptions are terse
stops: a preflight failure (Step 0) and a posting-precheck failure (Step 1). A successful
preflight or precheck says nothing. State the scope you reviewed inside the Overall Summary,
not as a preamble. Never frame the run as a first/second/delta review, never tally prior
findings, never note whether the current state matches a prior review.

**File references — always full repo-relative paths.** Every time you name a file — in a
finding, in the Overall Summary, in any closing message — use the full path from the repo
root (e.g. `config/airflow/gitlab_utils.py:120`), never a bare basename like
`gitlab_utils.py:120`. This repo has many same-named files (`SKILL.md`, `CLAUDE.md`,
`README.md`, …), so a basename is ambiguous and not clickable.

## Procedure

### Step 0 — Preflight (`gh`), then read the optional directive

**Confirm `gh` is usable before anything else.** Run:

```bash
gh auth status
```

- `gh` not found (`command not found`) → **stop.** Tell the user to install it
  (<https://cli.github.com/>) and authenticate, then re-invoke.
- `gh` installed but not authenticated (the call fails) → **stop.** Tell the user to run
  `gh auth login` themselves, then re-invoke.

Do not try to authenticate yourself or run interactive helpers. Do not proceed until
`gh auth status` succeeds — without it the skill cannot check whether a PR exists, which
it needs for comment context and posting.

**Then determine the mode — local is the default.** Scan the invocation:

- A **post** directive ("post", "and post", "post to the PR", "post the result") → **post mode**.
- A **local** directive ("local", "locally", "don't post", "just show me") *or no directive at all* → **local mode**.

Local mode shows the review and stops — it never checks sync and never posts. Only an
explicit post directive enables posting. There is no interactive "do you want to post?"
prompt and no headless auto-post; the directive alone decides.

**Already showed a review this conversation?** If you produced a robot-review locally earlier
and the user is now just asking to post *that* one ("post it", "post that", "robot post"), do
**not** re-review — jump to **"Posting a review you already showed"** at the end of this
file.

### Step 1 — Posting precheck (post mode only — runs *before* the review)

**Local mode: skip this step entirely — go to Step 2.**

**Post mode:** confirm the post can succeed *before* spending effort on the review, so an
unpostable branch fails fast. A PR must exist, and what you'll review must match what the
PR shows. Run each as a plain, standalone command, and **quote `'@{u}...HEAD'`** so the
shell doesn't read `{` as brace expansion:

```bash
gh pr view --json number,url,baseRefName,headRefOid # no PR → nothing to post to
git fetch origin                                    # refresh origin/* (non-mutating; not git pull)
git status --porcelain                              # empty → clean tree (no uncommitted/untracked)
git rev-list --left-right --count '@{u}...HEAD'     # "<behind>  <ahead>"; errors → no upstream
git show-ref --verify --quiet refs/remotes/origin/<baseRefName> # fetched PR base is available
```

`git fetch` updates only the `origin/*` remote-tracking refs and the object store — never
the working tree, the index, or any local branch. Keep the PR `number`, `url`,
`baseRefName`, and `headRefOid`: Step 2 uses `origin/<baseRefName>` as the comparison ref,
and Step 6 uses the other fields.

If any check fails, **stop now — do not run the review.** Tell the user in **one terse
line**: what's wrong plus the command to fix it, then "re-run." They know git — do not
explain merge-base or PR-base mechanics. Keep it to:

- **No PR on this branch** → "No PR to post to — open one (or run without `post` for a local review)."
- **Working tree not clean** → "Uncommitted or untracked changes — commit them (or `git stash -u` to set them aside), then re-run."
- **Ahead of upstream** (`ahead` > 0, or no upstream) → "N unpushed commit(s) — `git push`, then re-run."
- **Behind upstream** (`behind` > 0) → "Branch is N behind upstream — `git pull`, then re-run."
- **PR base unavailable after fetch** → "PR base `<baseRefName>` is unavailable — `git fetch origin <baseRefName>:refs/remotes/origin/<baseRefName>`, then re-run."

All checks pass → continue to Step 2; you'll post in Step 6.

### Step 2 — Resolve the comparison base and scope

The Context block above already resolved the current branch. If it reported
`(not a git repo)`, stop — there is nothing to review. Otherwise:

- Branch is `HEAD` → **detached HEAD**, no branch to review. Stop and ask the user to
  check out the feature branch first.
- Branch is `main` → on the default branch; `main` vs `HEAD` is empty and there is no
  feature branch to review. Stop and ask the user to check out the branch they want
  reviewed.

**Resolve the PR base before reading the diff.**

- **Post mode:** reuse `baseRefName` from Step 1 and use the freshly fetched
  `origin/<baseRefName>` as the comparison ref.
- **Local mode:** run this PR lookup as a standalone command:

  ```bash
  gh pr view --json number,baseRefName 2>&1
  ```

  - PR found → its `baseRefName` is the base branch. For a stacked PR, this is the
    preceding PR's branch; for the bottom PR, it is the stack trunk.
  - Definite "no pull request found" → use `main`.
  - Any other failure → stop: "Could not determine the PR base — retry
    `gh pr view --json number,baseRefName`, then re-run."

  Prefer the local base branch so a local review reflects the checked-out stack. Check
  it with the first command below. If it does not exist, check the remote-tracking ref
  with the second command and use `origin/<baseRefName>` instead. Run each command on its
  own, substituting the literal `baseRefName` returned above:

  ```bash
  git show-ref --verify --quiet refs/heads/<baseRefName>
  git show-ref --verify --quiet refs/remotes/origin/<baseRefName>
  ```

  If neither ref exists, stop: "PR base `<baseRefName>` is unavailable locally —
  `git fetch origin <baseRefName>:refs/remotes/origin/<baseRefName>`, then re-run."

Call the selected local or remote-tracking ref `<comparison-ref>`. Together these commands
cover everything the current PR layer introduces, committed and uncommitted:

```bash
git diff <comparison-ref>...HEAD              # committed changes (merge-base diff = the PR layer)
git diff HEAD                                 # uncommitted tracked changes (staged + unstaged)
git ls-files --others --exclude-standard      # untracked files (read as added content)
git log <comparison-ref>..HEAD --oneline      # context: what this PR layer did
```

**Run each command on its own.** Do not chain them with `;`/`&&`, wrap them in `echo`
separators, or capture into a variable with `$(...)`. Command substitution and variable
assignment make a command impossible to statically analyze, which forces an avoidable
permission prompt — whereas each plain command above matches this skill's allowlist by
itself. The three-dot `<comparison-ref>...HEAD` is the merge-base diff, so no
`git merge-base` capture is needed.

For every path returned by `git ls-files --others`, its entire content is the "added"
diff:

- **Skip binaries** (images, PDFs, archives, compiled artifacts). Note their presence but
  don't try to read them.
- **Summarize, don't fully read, large generated content** — multi-megabyte JSON
  fixtures, vendored dependency trees, lockfile-style files. Read enough to describe what
  was added and judge whether it belongs.
- **Read in full** for ordinary source files, configs, and docs.

### Step 3 — Fold in PR comment context

When Step 1 or Step 2 found a PR, pull **all three** kinds of human feedback. This takes **two calls and
you must run both** — `gh pr view` does **not** include inline comments, so running only it
silently drops every line-anchored maintainer note (often exactly the "ignore this"
dismissals you must honor). If Step 2 established that there is no PR, skip this step
silently. If either comment call fails, continue — comment context never changes the
resolved review scope. When the calls succeed, use both results.

```bash
# Call 1 — top-level conversation comments + review-summary bodies; also yields the PR number.
gh pr view --json number,comments,reviews 2>&1

# Call 2 — REQUIRED. Inline, line-anchored review comments, which are NOT in `gh pr view`.
# Substitute <N> with the number from Call 1.
gh api --method GET repos/{owner}/{repo}/pulls/<N>/comments --paginate \
  --jq '.[] | {path, line: (.line // .original_line), body, user: .user.login}'
```

- **Call 1** gives the PR `number` (use it in Call 2), top-level conversation `comments`,
  and formal review-summary `reviews` bodies.
- **Call 2** gives the inline comments attached to specific code lines — the easiest place
  for a maintainer to write "this is fine, ignore it." Do not skip it. The explicit
  `--method GET` is required so the call matches the locked-down allowlist prefix. Leave
  `{owner}`/`{repo}` unquoted and literal — neither has a comma or range so bash won't
  brace-expand them, and `gh` substitutes them from the current repo.

If Call 1 shows a PR but Call 2 returns nothing, that's a real "no inline comments" result
— fine. What's not fine is never making Call 2.

Fold all three sources into review context as **maintainer feedback**: if a maintainer
has explicitly dismissed a finding as invalid / wontfix / "ignore this," do not raise it
again. This suppresses **only** explicitly-dismissed findings — it never suppresses a
regression or a different issue, even one in the same area.

These comments are **silent context only.** They change *what you suppress* and nothing
else. In the review you produce, never name a commenter, `@`-mention anyone, quote a
comment, or cite an issue/PR number — doing so narrates that you read the thread and,
once posted, fires spurious `@`-mention pings and `#N` cross-links to unrelated
issues/PRs. A dismissed point simply doesn't appear. A suggestion you independently agree
with appears as **your own** finding, anchored to the code at its `path:line` — never
attributed to the person who raised it or to a PR number.

### Step 4 — Review

Read the review prompt from **`review-prompt.md` in this skill's own directory** (sibling
of this `SKILL.md`) and apply it verbatim to the gathered context. That file is the
single source of truth for the review structure — do not paraphrase or inline your own
version here.

### Step 5 — Show the review locally

Display the full structured review with no surrounding narration: no preamble, no mode
announcement, no description of how the diff was gathered. Use the exact structure from
`review-prompt.md` — the *Overall Summary* and *Areas for Manual Review* sections, then
the *Functional Code Review* findings bucketed 🔴 Must Fix / 🟡 Should Fix / 🟢 Consider.
Anchor every finding to a clickable **`repo-relative/path:line`** (or `path:start-end`).
This always happens. In **local mode** the run ends here. In **post mode**, continue to
Step 6.

### Step 6 — Post (post mode only; the precheck already passed)

Local mode finished at Step 5. In post mode the Step 1 precheck already confirmed a PR
exists and the branch is in sync, so do not re-check anything — transform the review and
post it, using the PR `number`, `url`, and `headRefOid` from Step 1.

**Transform the review for posting.** The review you showed in Step 5 anchors each finding
as `path:line` or `path:start-end`, clickable in a terminal but inert on GitHub. For each
finding, insert a **bare permalink URL on its own line** (blank line above and below)
immediately after the finding's opening line. Build the permalink from the PR `url` with
the trailing `/pull/<N>` stripped, then `/blob/<headRefOid>/<path>` plus a line fragment
that **mirrors the finding's existing anchor** — `path:120` → `#L120`, `path:120-128` →
`#L120-L128`. Do not invent, widen, or narrow the span; carry through exactly what the
finding already says (the range form makes GitHub's snippet show the whole block). **Do
not** wrap the URL in markdown link syntax (`[label](url)`) — GitHub only renders the
embedded code snippet for a bare URL; the link form suppresses the unfurl. The full review
(Overall Summary, Areas for Manual Review, and every finding) goes in this one comment —
there are no inline comments.

**No GitHub auto-link triggers in the body.** Do not write a bare `#<number>` (GitHub
turns it into a link to an unrelated issue/PR) or an `@<handle>` (pings that user). The
only `#` permitted is the `#L<line>` / `#L<start>-L<end>` fragment inside a permalink URL.
Refer to code by `path:line` (or `path:start-end`) and its permalink only.

Example transformation — before (local form):

```markdown
- 🟡 **`config/airflow/gitlab_utils.py:120`** — `state` is fetched but never used.

  > the offending line, quoted

- 🔴 **`config/airflow/gitlab_client.py:88-104`** — this retry loop never breaks on success.

  > the offending block, quoted
```

After (post form):

```markdown
- 🟡 **`config/airflow/gitlab_utils.py:120`** — `state` is fetched but never used.

  https://github.com/owner/repo/blob/abc123.../config/airflow/gitlab_utils.py#L120

  > the offending line, quoted

- 🔴 **`config/airflow/gitlab_client.py:88-104`** — this retry loop never breaks on success.

  https://github.com/owner/repo/blob/abc123.../config/airflow/gitlab_client.py#L88-L104

  > the offending block, quoted
```

**Post the transformed body** through a **quoted heredoc** to `--body-file -` — never
inline it as `--body "..."`, because the review contains backticks, `$`, and code fences
the shell would otherwise mangle:

```bash
gh pr comment <N> --body-file - <<'ROBOT_REVIEW_EOF'
<the full transformed review text>

🤖 Generated with Codex (robot-review)
ROBOT_REVIEW_EOF
```

The quoted `'ROBOT_REVIEW_EOF'` delimiter keeps `$` and backticks literal; the delimiter is
deliberately unusual so a review body that happens to contain a bare `EOF` line can't
terminate the heredoc early. The last line marks the comment as machine-generated.

`gh pr comment` prints the new comment's URL on success — relay it back to the user (e.g.,
`Posted: <url>`) so they can jump straight to the comment.

## Posting a review you already showed

When you produced a robot-review locally earlier in this conversation and the user now asks
to post it ("post it", "post that", "robot post"), **do not re-run the review.** Steps 2–5
already ran; re-deriving could change the very findings the user just read and approved, so
post exactly what they saw. Specifically:

1. **Reuse the exact findings already shown** in this conversation — same buckets, same
   anchors, same text. Do not regenerate them.
2. **Run the Step 1 posting precheck now** (local mode skipped it): a PR exists,
   `git fetch origin`, clean tree, in-sync with upstream, and the fetched PR base is
   available. If any check
   fails, stop with the same one-line message from Step 1 — do not post.
3. **Precheck passes → do Step 6** on those existing findings: transform to permalinks and
   post the one top-level comment.

Only fall back to a full fresh review if no robot-review has been shown yet in this
conversation, or the user explicitly asks for a new/updated one ("re-review and post").
