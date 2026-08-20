Review these changes. **How to review** below sets the approach; sections 1–3 define the report to produce.

## How to review
- Judge the changes and the code you need to read to understand them — you don't
  need to survey unrelated parts of the repo.
- **Check references to changed or removed symbols.** For each function, method, type, or
  interface that was changed or removed in the diff — where "changed" includes a signature
  that gained a new required parameter or dependency:
  1. Use grep or ripgrep to find every file in the repo that references that symbol,
     including tests, test setup, and fixtures.
  2. Read those files.
  3. Flag any reference that is now broken or incompatible with the change — not just direct
     calls, but also a construction or registration of a changed type that no longer supplies
     everything its new signature requires (these often fail at runtime, not at compile time).
- **Review the tests and test setup affected by the change**, including service/dependency
  registration in test hosts and fixtures — these are easy to overlook, and a missing
  registration there fails only at runtime, not in the diff.
- Base findings on reading the code — don't run tests, builds, or other commands to
  verify them. If a concern needs execution to confirm, raise it under "Areas for
  Manual Review" instead.
- Check the changes against the project's documented conventions. Read the **root
  `CLAUDE.md`** *and* any **`CLAUDE.md` in a directory the diff touches** (or an ancestor of
  it, up to the root) — this repo keeps sub-project conventions in nested files such as
  `kubernetes/CLAUDE.md` and `docs/changelog/CLAUDE.md` that the
  root file doesn't cover, and a finding that violates one is only catchable if you read it.
  Use the **Relevant Documentation** section of `CLAUDE.md` as a curated index — read any listed doc whose description matches what the diff touches. Don't read the whole docs tree.
- Anchor every finding to a `path:line` using the **full repo-relative path** from the
  repo root, never a bare basename — this project has many files that share a name
  (`SKILL.md`, `CLAUDE.md`, `README.md`, …), so a basename is ambiguous and not
  clickable. Write `.claude/skills/pancake-review/SKILL.md:186`, **not** `SKILL.md:186`.
  When the finding spans multiple lines (a block, a function, a multi-line statement),
  anchor to the **full span** as `path:start-end` (e.g. `config/airflow/foo.py:120-128`);
  use a single `path:line` only when the issue truly concerns one line. Use that same
  full path (and span) anywhere else you mention the file, including any summary.
  Quote the offending code so it's actionable.
- Calibrate severity honestly, and omit any section or bucket with no genuine finding.
  A short, accurate review beats a padded one — don't invent issues to fill a category.
- **Do not flag** the following — posted PR comments are loud, and every padded finding is
  friction for the author:
  - Issues a linter, typechecker, or formatter would catch. This project runs Ruff,
    SQLFluff, and mypy in CI, so style, formatting, import-order, and type findings
    already surface there — don't repeat them in the review.

- Review the change, not the review run. Don't narrate process: no "first/second/delta
  review" framing, no count of prior comments, no description of how the diff was
  gathered, no statement about whether the current state matches what was reviewed
  before. The Overall Summary covers the change's purpose, files, and scope; the rest
  covers the code.

## 1. Overall Summary
- Purpose of the change
- Files/modules affected
- Scope (bug fix, feature, refactor, etc.)

## 2. Areas for Manual Review  (omit if none)
Flag areas needing human judgment:
- Architectural decisions
- Business logic / domain rules
- Security considerations
- Performance implications
- Breaking changes
- New dependencies, including indirect dependencies used in scripts and documentation

For each area, explain WHY it needs review and what questions to consider.

## 3. Functional Code Review
- **Correctness**: Logic errors, edge cases, error handling
- **Code quality**: Readability, naming, duplication, complexity
- **Testing**: Missing coverage, test quality
- **Documentation**: Missing or outdated

Format findings as (omit any bucket with no findings):
- 🔴 **Must Fix**: Bugs, security issues, broken functionality
- 🟡 **Should Fix**: Code quality, missing tests, unclear logic
- 🟢 **Consider**: Style suggestions, minor improvements
